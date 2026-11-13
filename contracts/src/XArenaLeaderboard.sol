// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title XArenaLeaderboard
/// @notice On-chain top-10 leaderboard for X Arena, the cute paintball arena
///         shooter built for the X Layer TapeOut Accelerate hackathon.
/// @dev Deployed on X Layer TESTNET (chain 1952) only. No mainnet funds,
///      no token, no fees — just score records. Each wallet keeps its best
///      score; the top-10 array is kept sorted on-chain (highest first).
contract XArenaLeaderboard {
    struct Entry {
        address player;
        uint256 score;
        uint256 kills;
        uint256 timestamp;
    }

    Entry[10] private top;
    uint256 public topCount;
    uint256 public totalSubmissions;

    mapping(address => uint256) public bestScore;
    mapping(address => uint256) public bestKills;

    event ScoreSubmitted(
        address indexed player,
        uint256 score,
        uint256 kills,
        uint256 timestamp
    );

    /// @notice Submit a match score. Only improves the caller's best score.
    /// @param score Match points (splat = 100, OKB coin = 25).
    /// @param kills Number of bots splatted in the match.
    function submitScore(uint256 score, uint256 kills) external {
        totalSubmissions++;
        emit ScoreSubmitted(msg.sender, score, kills, block.timestamp);

        // Only a new personal best can enter the top 10.
        if (score <= bestScore[msg.sender]) return;
        bestScore[msg.sender] = score;
        bestKills[msg.sender] = kills;

        // Remove the caller's old entry from the top array, if present.
        uint256 n = topCount;
        for (uint256 i = 0; i < n; i++) {
            if (top[i].player == msg.sender) {
                for (uint256 j = i; j + 1 < n; j++) top[j] = top[j + 1];
                n--;
                break;
            }
        }

        // If the board is full and the new score is not better than the
        // lowest entry, there is nothing to insert.
        if (n == 10 && score <= top[9].score) {
            topCount = n;
            return;
        }

        // Insert at the right position (sorted descending by score).
        uint256 pos = n;
        while (pos > 0 && top[pos - 1].score < score) pos--;
        uint256 end = n < 10 ? n : 9;
        for (uint256 k = end; k > pos; k--) top[k] = top[k - 1];
        top[pos] = Entry(msg.sender, score, kills, block.timestamp);
        topCount = n < 10 ? n + 1 : 10;
    }

    /// @notice The on-chain top 10, highest score first.
    /// @return entries Fixed 10-slot array (unused slots are zeroed).
    /// @return count Number of filled slots (0..10).
    function getTop10()
        external
        view
        returns (Entry[10] memory entries, uint256 count)
    {
        return (top, topCount);
    }

    /// @notice Best score of one player.
    function getPlayer(address player)
        external
        view
        returns (uint256 score, uint256 kills)
    {
        return (bestScore[player], bestKills[player]);
    }
}
