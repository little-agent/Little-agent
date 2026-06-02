// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @notice Standard ERC-20 Interface for token operations
 */
interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/**
 * @title PredictionMarket
 * @author Swarm Command Cockpit Engine
 * @notice An on-chain Automated Market Maker (AMM) prediction market for AI agents
 * utilizing Robin Hanson's Logarithmic Market Scoring Rule (LMSR) and an external ERC-20 token.
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
        uint256 liquidityPool; // Represented in ERC-20 Credit Tokens
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
    
    // Track if an agent has claimed their payout for a given resolved market
    mapping(string => mapping(address => bool)) public hasClaimed;

    // The ERC-20 Token contract used for credits
    address public tokenAddress;
    address[] public registeredAgents;

    // LMSR AMM Constant Liquidity Parameter b
    uint256 public constant B = 100 * 1e18; // scaled to 18 decimals

    // Events
    event MarketCreated(string marketId, string title, address indexed creator, uint256 expiresAt);
    event TradePlaced(string marketId, address indexed trader, TradeType indexed tradeType, uint256 shares, uint256 cost, string rationale);
    event MarketResolved(string marketId, Outcome outcome, uint256 totalPayout);
    event PayoutClaimed(string marketId, address indexed trader, uint256 amount);
    event BalanceUpdated(address indexed agent, uint256 newBalance);

    modifier onlyOpen(string memory _marketId) {
        require(markets[_marketId].status == MarketStatus.OPEN, "Market is not open");
        require(block.timestamp < markets[_marketId].expiresAt, "Market has expired");
        _;
    }

    constructor(address _tokenAddress) {
        tokenAddress = _tokenAddress;
    }

    /**
     * @notice Backward compatible helper to fetch token balance of an agent
     */
    function tokenBalances(address _agent) public view returns (uint256) {
        return IERC20(tokenAddress).balanceOf(_agent);
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
        
        // Track unique registered agents (creator)
        _registerAgent(msg.sender);
        
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
        
        require(IERC20(tokenAddress).balanceOf(msg.sender) >= cost, "Insufficient ERC-20 credit balance");
        
        // Execute token transfer from trader to this contract
        require(
            IERC20(tokenAddress).transferFrom(msg.sender, address(this), cost),
            "Token transfer failed"
        );
        market.liquidityPool += cost;
        
        // Distribute shares
        if (_tradeType == TradeType.BUY_YES) {
            agentYesShares[_marketId][msg.sender] += _shares;
            market.yesShares = yesAfter;
        } else {
            agentNoShares[_marketId][msg.sender] += _shares;
            market.noShares = noAfter;
        }
        
        _registerAgent(msg.sender);
        
        emit TradePlaced(_marketId, msg.sender, _tradeType, _shares, cost, _rationale);
        emit BalanceUpdated(msg.sender, IERC20(tokenAddress).balanceOf(msg.sender));
        
        return cost;
    }

    /**
     * @notice Resolve prediction market
     */
    function resolveMarket(string memory _marketId, Outcome _outcome) external {
        Market storage market = markets[_marketId];
        require(market.status == MarketStatus.OPEN, "Market must be open to resolve");
        require(msg.sender == market.creator || IERC20(tokenAddress).balanceOf(msg.sender) > 0, "Unauthorized resolver");
        require(_outcome == Outcome.YES || _outcome == Outcome.NO, "Invalid outcome");
        
        market.status = MarketStatus.RESOLVED;
        market.outcome = _outcome;
        
        emit MarketResolved(_marketId, _outcome, market.liquidityPool);
    }

    /**
     * @notice Claim winning payout for a resolved prediction market
     * Win pays exactly 1 CCT per share.
     */
    function claimPayout(string memory _marketId) external {
        Market storage market = markets[_marketId];
        require(market.status == MarketStatus.RESOLVED, "Market must be resolved to claim");
        require(!hasClaimed[_marketId][msg.sender], "Payout already claimed");

        uint256 winningShares = 0;
        if (market.outcome == Outcome.YES) {
            winningShares = agentYesShares[_marketId][msg.sender];
        } else if (market.outcome == Outcome.NO) {
            winningShares = agentNoShares[_marketId][msg.sender];
        }

        require(winningShares > 0, "No winning shares to claim");
        hasClaimed[_marketId][msg.sender] = true;

        // Execute token payout from contract back to trader
        require(
            IERC20(tokenAddress).transfer(msg.sender, winningShares),
            "Token payout transfer failed"
        );

        emit PayoutClaimed(_marketId, msg.sender, winningShares);
        emit BalanceUpdated(msg.sender, IERC20(tokenAddress).balanceOf(msg.sender));
    }

    function _registerAgent(address _agent) internal {
        for (uint256 i = 0; i < registeredAgents.length; i++) {
            if (registeredAgents[i] == _agent) {
                return;
            }
        }
        registeredAgents.push(_agent);
    }

    /**
     * @notice Mathematical calculation of LMSR cost curve
     */
    function calculateLmsrCost(uint256 _yesShares, uint256 _noShares) public pure returns (uint256) {
        uint256 maxVal = _yesShares > _noShares ? _yesShares : _noShares;
        
        uint256 expY = expNegDivB(maxVal - _yesShares);
        uint256 expN = expNegDivB(maxVal - _noShares);
        
        uint256 sumExp = expY + expN; // scale: 1e18, range [1e18, 2e18]
        uint256 lnSum = lnScaled(sumExp); // scale: 1e18
        
        return maxVal + lnSum;
    }

    function expNegDivB(uint256 _diff) internal pure returns (uint256) {
        uint256 idx = _diff / 10000000000000000000; 
        if (idx >= 100) return 0;
        uint256 rem = _diff % 10000000000000000000;
        
        uint256[101] memory table = [
            uint256(1000000000000000000), uint256(904837418035959552), uint256(818730753077981824), uint256(740818220681717888), uint256(670320046035639296),
            uint256(606530659712633472), uint256(548811636094026368), uint256(496585303791409536), uint256(449328964117221568), uint256(406569659740599104),
            uint256(367879441171442304), uint256(332871083698079552), uint256(301194211912202112), uint256(272531793034012608), uint256(246596963941606496),
            uint256(223130160148429824), uint256(201896517994655392), uint256(182683524052734656), uint256(165298888221586528), uint256(149568619222635072),
            uint256(135335283236612704), uint256(122456428252981904), uint256(110803158362333872), uint256(100258843722803744), uint256(90717953289412512),
            uint256(82084998623898800), uint256(74273578214333872), uint256(67205512739749760), uint256(60810062625217976), uint256(55023220056407232),
            uint256(49787068367863944), uint256(45049202393557800), uint256(40762203978366208), uint256(36883167401240016), uint256(33373269960326080),
            uint256(30197383422318500), uint256(27323722447292560), uint256(24723526470339388), uint256(22370771856165600), uint256(20241911445804392),
            uint256(18315638888734180), uint256(16572675401761254), uint256(14995576820477704), uint256(13568559012200934), uint256(12277339903068436),
            uint256(11108996538242306), uint256(10051835744633586), uint256(9095277101695816), uint256(8229747049020030), uint256(7446583070924338),
            uint256(6737946999085467), uint256(6096746565515638), uint256(5516564420760772), uint256(4991593906910217), uint256(4516580942612666),
            uint256(4086771438464066), uint256(3697863716482932), uint256(3345965457471272), uint256(3027554745375815), uint256(2739444818768368),
            uint256(2478752176666358), uint256(2242867719485803), uint256(2029430636295734), uint256(1836304777028907), uint256(1661557273173934),
            uint256(1503439192977572), uint256(1360368037547893), uint256(1230911902673481), uint256(1113775147844803), uint256(1007785429048510),
            uint256(911881965554516), uint256(825104923265904), uint256(746585808376679), uint256(675538775193844), uint256(611252761129572),
            uint256(553084370147833), uint256(500451433440610), uint256(452827182886796), uint256(409734978979786), uint256(370743540459088),
            uint256(335462627902511), uint256(303539138078866), uint256(274653569972142), uint256(248516827107951), uint256(224867324178848),
            uint256(203468369010644), uint256(184105793667579), uint256(166585810987633), uint256(150733075095476), uint256(136388926482011),
            uint256(123409804086679), uint256(111665808490114), uint256(101039401837093), uint256(91424231478173), uint256(82724065556632),
            uint256(74851829887700), uint256(67728736490853), uint256(61283495053222), uint256(55451599432176), uint256(50174682056175),
            uint256(45399929762484)
        ];
        
        uint256 y0 = table[idx];
        uint256 y1 = table[idx + 1];
        
        return y0 - ((y0 - y1) * rem) / 10000000000000000000;
    }

    function lnScaled(uint256 _sumExp) internal pure returns (uint256) {
        if (_sumExp <= 1e18) return 0;
        if (_sumExp >= 2e18) return 693147180559945309; // ln(2) * 1e18
        uint256 z = _sumExp - 1e18;
        
        uint256[11] memory table = [
            uint256(0),
            95310179804324900,
            182321556793954600,
            262364264467491060,
            336472236621212900,
            405465108108164400,
            470003629245735500,
            530628251062141800,
            587786664902119000,
            641853886172394800,
            693147180559945300
        ];
        
        uint256 idx = z / 100000000000000000; // 0 to 9
        uint256 rem = z % 100000000000000000;
        
        uint256 y0 = table[idx];
        uint256 y1 = table[idx + 1];
        
        return y0 + ((y1 - y0) * rem) / 100000000000000000;
    }
}
