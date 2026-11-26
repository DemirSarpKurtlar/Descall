import Foundation

// Apple Watch games: pure logic in App/DescallWatch/Games/Logic (Foundation only).
//   swiftc -O -o /tmp/games App/DescallWatch/Games/Logic/*.swift selftest/games/*.swift && /tmp/games
let started = Date()
testCore()
testPong()
testBricks()
testSnake()
testMerge()
testBlocks()
testMines()
testSudoku()
testChess()
testRunner()
testCards()
testChallenge()

let ms = Int(Date().timeIntervalSince(started) * 1000)
if failures > 0 {
    print("\(failures) of \(checks) check(s) failed (\(ms) ms)")
    exit(1)
}
print("games logic selftest ok: \(checks) checks (\(ms) ms)")
