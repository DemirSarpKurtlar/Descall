import Foundation

// Yirmibir: blackjack against the dealer for points only. Never money, never DesCoin:
// the stack is a practice counter that refills when it runs dry.
// Rules: 4-deck shoe (reshuffled at a quarter left), dealer stands on soft 17, dealer peeks
// for twenty-one with an ace or ten up, twenty-one pays 3:2, double on any first two
// cards, one split (split aces get one card each), no insurance.

struct PlayingCard: Codable, Equatable {
    /// 1 = ace ... 11 jack, 12 queen, 13 king.
    var rank: Int
    /// 0 ... 3, drawn as the four suit shapes.
    var suit: Int

    var points: Int { rank == 1 ? 1 : min(10, rank) }
}

struct CardHand: Codable, Equatable {
    var cards: [PlayingCard] = []
    var bet = 0
    var doubled = false
    var stood = false
    var fromSplit = false

    /// Best total and whether an ace still counts 11.
    static func value(_ cards: [PlayingCard]) -> (total: Int, soft: Bool) {
        let hard = cards.reduce(0) { $0 + $1.points }
        let hasAce = cards.contains { $0.rank == 1 }
        if hasAce, hard + 10 <= 21 { return (hard + 10, true) }
        return (hard, false)
    }

    var total: Int { CardHand.value(cards).total }
    var soft: Bool { CardHand.value(cards).soft }
    var busted: Bool { total > 21 }
    /// Two-card 21, not after a split.
    var isNatural: Bool { cards.count == 2 && total == 21 && !fromSplit }
    var done: Bool { stood || busted || total == 21 || doubled }
}

enum CardsPhase: String, Codable {
    case betting, playing, dealer, settled
}

enum CardsOutcome: String, Codable {
    case natural, win, push, lose, bust
}

enum CardsEvent: Equatable {
    case dealt, card, bust, dealerCard, settled(net: Int), refilled
}

struct CardsState: Codable, Equatable {
    static let startStack = 1000
    static let minBet = 10
    static let maxBet = 200
    static let decks = 4

    var shoe: [PlayingCard] = []
    var dealer: [PlayingCard] = []
    var hands: [CardHand] = []
    var active = 0
    var phase: CardsPhase = .betting
    var stack = CardsState.startStack
    var bet = 20
    /// Highest stack this session (the best score).
    var peak = CardsState.startStack
    var outcomes: [CardsOutcome] = []
    var lastNet = 0
    var rounds = 0
    var refills = 0
    /// Rounds won in a row; from the third, every win pays a streak bonus.
    var streak = 0
    var bestStreak = 0
    var lastBonus = 0
    /// Cards left at which the next round reshuffles (a quarter of the shoe).
    var cut = CardsState.decks * 52 / 4
    var rng: GameRNG

    init(seed: UInt64) {
        rng = GameRNG(seed: seed)
        shuffleShoe()
    }

    mutating func shuffleShoe() {
        var cards: [PlayingCard] = []
        for _ in 0..<CardsState.decks {
            for suit in 0..<4 {
                for rank in 1...13 { cards.append(PlayingCard(rank: rank, suit: suit)) }
            }
        }
        cards.shuffle(using: &rng)
        shoe = cards
    }

    private mutating func draw() -> PlayingCard {
        if shoe.isEmpty { shuffleShoe() }
        return shoe.removeLast()
    }

    var dealerTotal: Int { CardHand.value(dealer).total }
    var dealerUp: PlayingCard? { dealer.first }

    mutating func setBet(_ value: Int) {
        let step = (value / CardsState.minBet) * CardsState.minBet
        bet = GameMath.clamp(step, CardsState.minBet, min(CardsState.maxBet, max(CardsState.minBet, stack)))
    }

    /// Starts a round with the current bet (refills an empty stack first).
    mutating func deal() -> [CardsEvent] {
        guard phase == .betting || phase == .settled else { return [] }
        var events: [CardsEvent] = []
        if stack < CardsState.minBet {
            stack = CardsState.startStack
            refills += 1
            events.append(.refilled)
        }
        if shoe.count < cut { shuffleShoe() }
        setBet(bet)
        stack -= bet
        let p1 = draw(), d1 = draw(), p2 = draw(), d2 = draw()
        hands = [CardHand(cards: [p1, p2], bet: bet)]
        dealer = [d1, d2]
        active = 0
        outcomes = []
        phase = .playing
        events.append(.dealt)
        // Peek: a dealer twenty-one ends the round at once (a player twenty-one pushes).
        let dealerNatural = CardHand.value(dealer).total == 21
        if dealerNatural || hands[0].isNatural {
            events += settle()
        }
        return events
    }

    var current: CardHand? { phase == .playing && active < hands.count ? hands[active] : nil }

    var canDouble: Bool {
        guard let h = current else { return false }
        return h.cards.count == 2 && !h.doubled && stack >= h.bet
    }

    var canSplit: Bool {
        guard let h = current else { return false }
        return hands.count == 1 && h.cards.count == 2 && h.cards[0].points == h.cards[1].points && stack >= h.bet
    }

    mutating func hit() -> [CardsEvent] {
        guard current != nil else { return [] }
        hands[active].cards.append(draw())
        var events: [CardsEvent] = [.card]
        if hands[active].busted { events.append(.bust) }
        return events + advanceIfDone()
    }

    mutating func stand() -> [CardsEvent] {
        guard current != nil else { return [] }
        hands[active].stood = true
        return advanceIfDone()
    }

    mutating func double() -> [CardsEvent] {
        guard canDouble else { return [] }
        stack -= hands[active].bet
        hands[active].bet *= 2
        hands[active].doubled = true
        hands[active].cards.append(draw())
        var events: [CardsEvent] = [.card]
        if hands[active].busted { events.append(.bust) }
        return events + advanceIfDone()
    }

    mutating func split() -> [CardsEvent] {
        guard canSplit else { return [] }
        let h = hands[0]
        stack -= h.bet
        let aces = h.cards[0].rank == 1
        let c1 = draw(), c2 = draw()
        var a = CardHand(cards: [h.cards[0], c1], bet: h.bet, fromSplit: true)
        var b = CardHand(cards: [h.cards[1], c2], bet: h.bet, fromSplit: true)
        if aces {
            a.stood = true
            b.stood = true
        }
        hands = [a, b]
        active = 0
        return [.card] + advanceIfDone()
    }

    private mutating func advanceIfDone() -> [CardsEvent] {
        while active < hands.count, hands[active].done { active += 1 }
        guard active >= hands.count else { return [] }
        return playDealer()
    }

    private mutating func playDealer() -> [CardsEvent] {
        phase = .dealer
        var events: [CardsEvent] = []
        // Nobody left to beat: the dealer does not draw.
        if hands.contains(where: { !$0.busted }) {
            while true {
                // Stands on every 17, soft 17 included.
                if CardHand.value(dealer).total >= 17 { break }
                dealer.append(draw())
                events.append(.dealerCard)
            }
        }
        return events + settle()
    }

    /// Pays every hand. Returns the round's net in points.
    private mutating func settle() -> [CardsEvent] {
        let d = CardHand.value(dealer).total
        let dealerNatural = dealer.count == 2 && d == 21
        var net = 0
        outcomes = []
        for h in hands {
            let outcome: CardsOutcome
            var back = 0
            if h.busted {
                outcome = .bust
            } else if h.isNatural && !dealerNatural {
                outcome = .natural
                back = h.bet + h.bet * 3 / 2
            } else if dealerNatural && !h.isNatural {
                outcome = .lose
            } else if d > 21 || h.total > d {
                outcome = .win
                back = h.bet * 2
            } else if h.total == d {
                outcome = .push
                back = h.bet
            } else {
                outcome = .lose
            }
            outcomes.append(outcome)
            stack += back
            net += back - h.bet
        }
        // Streak bonus: 10 % of the bet per win in a row from the third, at most 50 %.
        lastBonus = 0
        if net > 0 {
            streak += 1
            bestStreak = max(bestStreak, streak)
            if streak >= 3 {
                let bet = hands.reduce(0) { $0 + $1.bet }
                lastBonus = bet * min(5, streak - 2) / 10
                stack += lastBonus
                net += lastBonus
            }
        } else if net < 0 {
            streak = 0
        }
        lastNet = net
        peak = max(peak, stack)
        rounds += 1
        phase = .settled
        return [.settled(net: net)]
    }
}
