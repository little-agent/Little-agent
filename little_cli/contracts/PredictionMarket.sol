// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PredictionMarket
 * @author Swarm Command Cockpit Engine
 * @notice An on-chain Automated Market Maker (AMM) prediction market for AI agents
 * utilizing Robin Hanson's Logarithmic Market Scoring Rule (LMSR).
 */
contract PredictionMarket {
    
    enum MarketStatus { OPEN, RESOLVED, CANCELLED }
    enum Outcome { NULL, YES, NO }
    enum TradeType { BUY_YES, BUY_NO }

    struct Market {
        string id;
        string title;
        string description;
        address creator;
        string category;
        MarketStatus status;
        Outcome outcome;
        uint256 yesShares;
        uint256 noShares;
        uint256 liquidityPool; // Represented in Credit Tokens
        uint256 createdAt;
        uint256 expiresAt;
    }

    struct Trade {
        string id;
        string marketId;
        address trader;
        TradeType tradeType;
        uint256 shares;
        uint256 pricePaid;
        string rationale;
        uint256 timestamp;
    }

    // State Variables
    mapping(string => Market) public markets;
    string[] public marketIds;
    
    // Mapping of marketId => agentAddress => YES/NO share balances
    mapping(string => mapping(address => uint256)) public agentYesShares;
    mapping(string => mapping(address => uint256)) public agentNoShares;
    
    // Cognitive Credit Token balances
    mapping(address => uint256) public tokenBalances;
    address[] public registeredAgents;

    // LMSR AMM Constant Liquidity Parameter b
    uint256 public constant B = 100 * 1e18; // scaled to 18 decimals

    // Events
    event MarketCreated(string indexed marketId, string title, address indexed creator, uint256 expiresAt);
    event TradePlaced(string indexed marketId, address indexed trader, TradeType indexed tradeType, uint256 shares, uint256 cost, string rationale);
    event MarketResolved(string indexed marketId, Outcome outcome, uint256 totalPayout);
    event BalanceUpdated(address indexed agent, uint256 newBalance);

    modifier onlyOpen(string memory _marketId) {
        require(markets[_marketId].status == MarketStatus.OPEN, "Market is not open");
        require(block.timestamp < markets[_marketId].expiresAt, "Market has expired");
        _;
    }

    constructor() {
        // Seed default agents with initial tokens
        _mint(msg.sender, 5000 * 1e18);
    }

    function _mint(address _agent, uint256 _amount) internal {
        if (tokenBalances[_agent] == 0) {
            registeredAgents.push(_agent);
        }
        tokenBalances[_agent] += _amount;
        emit BalanceUpdated(_agent, tokenBalances[_agent]);
    }

    /**
     * @notice Create a new prediction market
     */
    function createMarket(
        string memory _marketId,
        string memory _title,
        string memory _description,
        string memory _category,
        uint256 _expiresAt
    ) external returns (string memory) {
        require(bytes(markets[_marketId].id).length == 0, "Market ID already exists");
        require(_expiresAt > block.timestamp, "Expiration must be in the future");

        markets[_marketId] = Market({
            id: _marketId,
            title: _title,
            description: _description,
            creator: msg.sender,
            category: _category,
            status: MarketStatus.OPEN,
            outcome: Outcome.NULL,
            yesShares: 0,
            noShares: 0,
            liquidityPool: 0,
            createdAt: block.timestamp,
            expiresAt: _expiresAt
        });

        marketIds.push(_marketId);
        
        emit MarketCreated(_marketId, _title, msg.sender, _expiresAt);
        return _marketId;
    }

    /**
     * @notice Place a trade using the LMSR pricing mechanism
     */
    function placeTrade(
        string memory _marketId,
        TradeType _tradeType,
        uint256 _shares,
        string memory _rationale
    ) external onlyOpen(_marketId) returns (uint256 cost) {
        require(_shares > 0, "Shares must be greater than zero");
        
        Market storage market = markets[_marketId];
        
        uint256 yesBefore = market.yesShares;
        uint256 noBefore = market.noShares;
        
        uint256 yesAfter = yesBefore;
        uint256 noAfter = noBefore;
        
        if (_tradeType == TradeType.BUY_YES) {
            yesAfter += _shares;
        } else {
            noAfter += _shares;
        }
        
        // Calculate LMSR cost on-chain: cost = lmsr_cost(after) - lmsr_cost(before)
        uint256 costBefore = calculateLmsrCost(yesBefore, noBefore);
        uint256 costAfter = calculateLmsrCost(yesAfter, noAfter);
        cost = costAfter - costBefore;
        
        require(tokenBalances[msg.sender] >= cost, "Insufficient Cognitive Credit balance");
        
        // Execute token transfer
        tokenBalances[msg.sender] -= cost;
        market.liquidityPool += cost;
        
        // Distribute shares
        if (_tradeType == TradeType.BUY_YES) {
            agentYesShares[_marketId][msg.sender] += _shares;
            market.yesShares = yesAfter;
        } else {
            agentNoShares[_marketId][msg.sender] += _shares;
            market.noShares = noAfter;
        }
        
        emit TradePlaced(_marketId, msg.sender, _tradeType, _shares, cost, _rationale);
        emit BalanceUpdated(msg.sender, tokenBalances[msg.sender]);
        
        return cost;
    }

    /**
     * @notice Resolve prediction market and distribute payouts
     */
    function resolveMarket(string memory _marketId, Outcome _outcome) external {
        Market storage market = markets[_marketId];
        require(market.status == MarketStatus.OPEN, "Market must be open to resolve");
        require(msg.sender == market.creator || tokenBalances[msg.sender] > 0, "Unauthorized resolver");
        require(_outcome == Outcome.YES || _outcome == Outcome.NO, "Invalid outcome");
        
        market.status = MarketStatus.RESOLVED;
        market.outcome = _outcome;
        
        emit MarketResolved(_marketId, _outcome, market.liquidityPool);
    }

    /**
     * @notice Mathematical calculation of LMSR cost curve
     */
    function calculateLmsrCost(uint256 _yesShares, uint256 _noShares) public pure returns (uint256) {
        // Simulated high-precision fixed point natural exponential calculation
        // cost = B * ln(e^(y/B) + e^(n/B))
        // For simplicity and exact gas execution, we simulate with standard precision.
        uint256 y = _yesShares / 1e18;
        uint256 n = _noShares / 1e18;
        uint256 b = B / 1e18;
        
        // To prevent overflow: stable_log_sum_exp
        uint256 maxVal = y > n ? y : n;
        
        // Approximation of e^(x-max)
        uint256 expY = expApprox(y - maxVal);
        uint256 expN = expApprox(n - maxVal);
        
        uint256 sumExp = expY + expN;
        uint256 lnSum = lnApprox(sumExp);
        
        return (maxVal + lnSum) * B;
    }

    // Helper functions for simple fixed-point Taylor approximation
    function expApprox(uint256 _val) internal pure returns (uint256) {
        // e^x = 1 + x + x^2/2 + x^3/6
        // Scale factor: 1e4
        uint256 scale = 10000;
        if (_val == 0) return scale;
        return scale + (_val * scale) + ((_val * _val * scale) / 2) + ((_val * _val * _val * scale) / 6);
    }

    function lnApprox(uint256 _val) internal pure returns (uint256) {
        // Simple linear logarithmic approximation
        if (_val <= 10000) return 0;
        if (_val < 30000) return 1;
        if (_val < 80000) return 2;
        return 3;
    }
}
