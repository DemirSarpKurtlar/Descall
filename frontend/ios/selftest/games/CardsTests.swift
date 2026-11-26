import Foundation

func card(_ rank: Int, _ suit: Int = 0) -> PlayingCard { PlayingCard(rank: rank, suit: suit) }

func testCards() {
    // Hand values.
    check(CardHand.value([card(1), card(13)]) == (21, true), "ace + king = soft 21")
    check(CardHand(cards: [card(1), card(13)]).isNatural, "two-card 21 is a natural")
    check(!CardHand(cards: [card(1), card(13)], fromSplit: true).isNatural, "not after a split")
    check(CardHand.value([card(1), card(1), card(9)]) == (21, true), "A A 9 = 21")
    check(CardHand.value([card(1), card(6)]) == (17, true), "soft 17")
    check(CardHand.value([card(1), card(6), card(10)]) == (17, false), "hard 17 after the ace drops to 1")
    check(CardHand.value([card(13), card(12), card(5)]) == (25, false), "bust")
    check(CardHand(cards: [card(13), card(12), card(5)]).busted, "busted")
    check(CardHand.value([card(1), card(1), card(1), card(1)]) == (14, true), "four aces")

    // Shoe: four decks, every card four times per suit.
    let s0 = CardsState(seed: 1)
    eq(s0.shoe.count, 208, "4 x 52 cards")
    eq(s0.shoe.filter { $0.rank == 1 }.count, 16, "sixteen aces")

    // Rounds settle and pay in points only; the stack never goes negative.
    var s = CardsState(seed: 2)
    for round in 0..<300 {
        s.setBet(10 + (round % 5) * 20)
        _ = s.deal()
        var guardSteps = 0
        while s.phase == .playing && guardSteps < 20 {
            guardSteps += 1
            if s.canSplit && round % 3 == 0 { _ = s.split(); continue }
            if s.canDouble && round % 7 == 0 { _ = s.double(); continue }
            if let h = s.current, h.total < 17 { _ = s.hit() } else { _ = s.stand() }
        }
        check(s.phase == .settled, "round \(round) settles")
        check(s.stack >= 0, "stack never negative")
        eq(s.outcomes.count, s.hands.count, "one outcome per hand")
        check(s.dealerTotal >= 17 || s.hands.allSatisfy { $0.busted } || s.dealer.count == 2, "dealer draws to 17")
        check(s.peak >= s.stack, "peak tracked")
    }
    check(s.rounds == 300, "300 rounds")

    // Payouts with stacked cards: the shoe deals from the end (player, dealer, player, dealer).
    func rigged(_ cards: [PlayingCard], bet: Int = 100) -> CardsState {
        var t = CardsState(seed: 9)
        t.shoe = cards.reversed()
        t.cut = 0
        t.stack = 1000
        t.bet = bet
        return t
    }
    var bj = rigged([card(1), card(9), card(13), card(7), card(5), card(5), card(5), card(5)])
    _ = bj.deal()
    eq(bj.outcomes, [.natural], "player natural")
    eq(bj.stack, 1000 + 150, "natural pays 3:2")
    var push = rigged([card(1), card(1), card(13), card(12), card(5), card(5)])
    _ = push.deal()
    eq(push.outcomes, [.push], "natural against natural pushes")
    eq(push.stack, 1000, "push returns the bet")
    var dealerBJ = rigged([card(10), card(1), card(9), card(13), card(5)])
    _ = dealerBJ.deal()
    eq(dealerBJ.outcomes, [.lose], "dealer natural wins at once")
    eq(dealerBJ.phase, .settled, "no play against a dealer natural")
    // Dealer stands on soft 17.
    var soft = rigged([card(10), card(1), card(8), card(6), card(5), card(5)])
    _ = soft.deal()
    _ = soft.stand()
    eq(soft.dealer.count, 2, "dealer stands on soft 17")
    eq(soft.outcomes, [.win], "18 beats 17")
    eq(soft.stack, 1100, "a win pays even money")
    // Double: one card, twice the bet.
    var dbl = rigged([card(6), card(10), card(5), card(7), card(10), card(5)])
    _ = dbl.deal()
    check(dbl.canDouble, "can double on two cards")
    _ = dbl.double()
    eq(dbl.hands[0].cards.count, 3, "one card on a double")
    eq(dbl.hands[0].bet, 200, "bet doubled")
    // Split aces get one card each.
    var aces = rigged([card(1), card(9), card(1), card(7), card(10), card(10), card(2), card(2)])
    _ = aces.deal()
    check(aces.canSplit, "pair of aces can split")
    _ = aces.split()
    eq(aces.hands.count, 2, "two hands")
    check(aces.hands.allSatisfy { $0.cards.count == 2 && $0.fromSplit && !$0.isNatural }, "one card each, never a natural")
    eq(aces.phase, .settled, "split aces settle at once")
    // Empty stack refills (points only).
    var broke = CardsState(seed: 4)
    broke.stack = 5
    let ev = broke.deal()
    check(ev.contains(.refilled) && broke.refills == 1, "an empty stack refills")
    // Streak bonus from the third win.
    var streak = CardsState(seed: 5)
    streak.streak = 2
    streak.cut = 0
    streak.shoe = [card(10), card(7), card(10), card(10), card(5), card(5)].reversed()
    streak.bet = 100
    _ = streak.deal()
    _ = streak.stand()
    eq(streak.streak, 3, "third win in a row")
    eq(streak.lastBonus, 10, "10 % streak bonus")
}
