// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "./IStakeToken.sol";
import "./extensions/VestingToken.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./extensions/DeVest.sol";

/** errors
E1 : Only owner can initialize tangibles
E2 : Tangible was terminated
E3 : Tangible already initialized
E4 : Only owner can initialize tangibles
E5 : Invalid tax value
E6 : Invalid tax value
E7 : Currently only max 2 decimals supported
E8 : Amount must be bigger than 100
E9 : Invalid amount submitted
E10 : Invalid price submitted
E11 : Active buy order, cancel first
E12 : Invalid amount submitted
E13 : Invalid price submitted
E14 : Insufficient shares
E15 : Active order, cancel first
E16 : Invalid amount submitted
E17 : Invalid order
E18 : Can't accept your own order
E19 : Insufficient shares
E20 : No open bid
E21 : Tangible was not initialized
E22 : Share was terminated
E23 : Invalid amount provided
E24 : Only shareholders can vote for switch tangible
E25 : Only owner can termination
E26 : Only DeVest can update Fees
*/


// DeVest Investment Model One
// Bid & Offer
contract DvStakeToken is IStakeToken, VestingToken, ReentrancyGuard, Context, DeVest {

    // ---------------------------- EVENTS ------------------------------------

    // When an shareholder exchanged his shares
    event Trade(address indexed from, address indexed to, uint256 quantity, uint256 price);

    // When payment was received
    event Payment(address indexed from, uint256 amount);

    // ---------------------------- ERRORS --------------------------------

    // contract was terminated and can't be used anymore
    bool public terminated = false;

    // trading is active (after initialization and before termination)
    bool public trading = false;

    // presale
    bool public presale = false;
    uint256 public presalePrice = 0;    // price per share
    uint256 public presaleShares = 0;   // total shares available for presale
    uint256 public presaleStart = 0;    // start date of presale
    uint256 public presaleEnd = 0;      // end date of presale

    // Offers
    struct Order {
        uint256 index;
        uint256 price;
        uint256 amount;
        uint256 escrow;
        bool bid; // buy = true | sell = false
    }
    mapping (address => Order) public orders;  // all orders
    address[] public orderAddresses;       // all order addresses

    uint256 public escrow;                // total amount in escrow

    // Stakes
    mapping (address => uint256) internal shares;                   // shares of shareholder
    mapping (address => uint256) internal shareholdersLevel;        // level of disburse the shareholder withdraw
    mapping (address => uint256) internal shareholdersIndex;        // index of the shareholders address
    address[] internal shareholders;                                // all current shareholders

    uint256[] public disburseLevels;    // Amount disburse in each level
    uint256 internal totalDisbursed;    // Total amount disbursed (not available anymore)

    // metadata
    string private _name;           // name of the tangible
    string private _symbol;         // symbol of the tangible
    uint8 private _decimals;        // decimals of the tangible
    uint256 private _totalSupply;   // total supply of shares (10^decimals)

    // ---- assets

    // Set owner and DI OriToken
    constructor(address _tokenAddress, string memory __name, string memory __symbol, address _factory, address _owner)
    VestingToken(_tokenAddress) DeVest(_owner, _factory) {
        _symbol = string(abi.encodePacked("% ", __symbol));
        _name = __name;

        shareholders.push(_owner);
        shareholdersIndex[_owner] = 0;
        shareholdersLevel[_owner] = 0;
    }

    // ----------------------------------------------------------------------------------------------------------
    // ----------------------------------------------- MODIFIERS ------------------------------------------------
    // ----------------------------------------------------------------------------------------------------------

    /**
    *  Verify tangible is active and initialized
    *
    */
    modifier _tradingActive() {
        require(trading, 'Trading not active');
        require(!terminated, 'E2');
        _;
    }

    modifier _presaleActive() {
        require(presale, 'E1');
        require(!terminated, 'E2');
        _;
    }

    // ----------------------------------------------------------------------------------------------------------
    // ------------------------------------------------ INTERNAL ------------------------------------------------
    // ----------------------------------------------------------------------------------------------------------

    /**
    *  Update stored bids, if bid was spend, remove from list
    */
    function _removeOrder(address orderOwner) internal {
        uint256 index = orders[orderOwner].index;
        orderAddresses[index] = orderAddresses[orderAddresses.length-1];
        orders[orderAddresses[orderAddresses.length-1]].index = index;
        delete orders[orderOwner];
        orderAddresses.pop();
    }

    function swapShares(address to, address from, uint256 amount) internal {
        require(getShares(from) >= amount, "Insufficient shares");
        require(from != to, "Can't transfer to yourself");

        // if shareholder has no shares add him as new
        if (shares[to] == 0) {
            shareholdersIndex[to] = shareholders.length;
            shareholdersLevel[to] = shareholdersLevel[from];
            shareholders.push(to);
        }

        require(shareholdersLevel[to] == shareholdersLevel[from], "Can't swap shares of uneven levels");
        shares[to] += amount;
        shares[from] -= amount;

        // remove shareholder without shares
        if (shares[from] == 0){
            shareholders[shareholdersIndex[from]] = shareholders[shareholders.length-1];
            shareholders.pop();
        }
    }

    // ----------------------------------------------------------------------------------------------------------
    // ------------------------------------------------- PUBLIC -------------------------------------------------
    // ----------------------------------------------------------------------------------------------------------

    /**
     *  Initialize TST as tangible
     */
    function initialize(uint tax, uint8 decimal) public onlyOwner virtual{
        require(!trading, 'E3');
        require(!presale, 'E3');
        require(!terminated, 'E2');
        require(tax >= 0 && tax <= 1000, 'E5');
        require(decimal >= 0 && decimal <= 10, 'Max 16 decimals');

        // set attributes
        _decimals = decimal += 2;
        _setRoyalties(tax, owner());

        // assign to publisher all shares
        _totalSupply = (10 ** _decimals);
        shares[_msgSender()] = _totalSupply;

        // start trading
        trading = true;
    }

    /**
      * optional initialization will not assign 100% to the owner, rather allow a kind of presale in which
      * the owner can sell a certain amount of shares to a certain price and after all shares are sold
      * the contract will be initialized.
      */
     function initializePresale(uint tax, uint8 decimal, uint256 price, uint256 start, uint256 end) public onlyOwner virtual{
         require(!trading, 'E3');
         require(!terminated, 'E2');
         require(tax >= 0 && tax <= 1000, 'E5');
         require(decimal >= 0 && decimal <= 10, 'Max 16 decimals');

         // set attributes
         _decimals = decimal += 2;
         _setRoyalties(tax, owner());
         _totalSupply = (10 ** _decimals);

         presale = true;
         presalePrice = price;
         presaleStart = start;
         presaleEnd = end;
     }

    function purchase(uint256 amount) public payable _presaleActive {
        require(presale, 'E10');
        require(block.timestamp >= presaleStart && block.timestamp <= presaleEnd, 'PreSale didn\'t start yet or ended already');
        require(amount > 0 && amount <= _totalSupply, 'E9');
        require(presaleShares + amount <= _totalSupply, 'Not enough shares left to purchase');

        // check if enough escrow allowed and pick the cash
        __allowance(_msgSender(), amount * presalePrice);
        __transferFrom(_msgSender(), address(this), amount * presalePrice);

        // check if sender is already in shareholders
        if (shares[_msgSender()] == 0){
            shareholdersIndex[_msgSender()] = shareholders.length;
            shareholdersLevel[_msgSender()] = 0;
            shareholders.push(_msgSender());
        }

        // assign bought shares to buyer
        shares[_msgSender()] += amount;

        presaleShares += amount;
        if (presaleShares >= _totalSupply) {
            presale = false;
            trading = true;
            __transfer(owner(), __balanceOf(address(this)));
        }
    }

    function getStart() public view returns (uint256, uint256) {
        return (block.timestamp - presaleStart, presaleEnd - block.timestamp);
    }

    // ----------------------------------------------------------------------------------------------------------
    // ------------------------------------------------ TRADING -------------------------------------------------

    /**
    * Swap shares between owners,
    * Check for same level of disburse !!
    */
    function transfer(address recipient, uint256 amount) external payable takeFee {
        require(amount > 0 && amount <= _totalSupply, 'E12');
        if (shares[_msgSender()] != amount){
            if (shares[recipient] > 0){
                require(shareholdersLevel[_msgSender()] == shareholdersLevel[recipient], "Recipients or sender has pending disbursements!");
            }
        }

        swapShares(recipient, _msgSender(), amount);
    }

    /**
    *  Buy Order
    *  _price: price for the amount of shares
    *  amount: amount
    */
    function buy(uint256 _price, uint256 amount) public payable virtual override nonReentrant _tradingActive {
        require(amount > 0 && amount <= _totalSupply, 'E9');
        require(_price > 0, 'E10');
        require(orders[_msgSender()].amount == 0, 'E11');

        // add tax to escrow
        uint256 _escrow = (_price * amount) + (_price * amount * getRoyalty()) / 1000;

        // check if enough escrow allowed
        __allowance(_msgSender(), _escrow);

        // store bid
        orders[_msgSender()] = Order(orderAddresses.length, _price, amount, _escrow, true);
        orderAddresses.push(_msgSender());

        // pull escrow
        __transferFrom(_msgSender(), address(this), _escrow);
        escrow += _escrow;
    }

    /**
     *  Sell order
     */
    function sell(uint256 _price, uint256 amount) public payable override nonReentrant _tradingActive {
        require(amount > 0 && amount <= _totalSupply, 'E12');
        require(_price > 0, 'E13');
        require(shares[_msgSender()]  > 0, 'E14');
        require(orders[_msgSender()].amount == 0, 'E15');

        // store bid
        orders[_msgSender()] = Order(orderAddresses.length, _price, amount, 0, false);
        orderAddresses.push(_msgSender());
    }

    /**
     *  Accept order
     */
    function accept(address orderOwner, uint256 amount) external override payable nonReentrant _tradingActive takeFee{
        require(amount > 0, "E16");
        require(orders[orderOwner].amount >= amount, "E17");
        require(_msgSender() != orderOwner, "E18");

        Order memory order = orders[orderOwner];

        // calculate taxes
        uint256 cost = order.price * amount;
        uint256 tax = (cost * getRoyalty()) / 1000;
        uint256 totalCost = cost + tax;

        // deduct amount from order
        orders[orderOwner].amount -= amount;

        // accepting on bid order
        if (order.bid == true) {
            _acceptBidOrder(orderOwner, cost, totalCost, amount, order.price);
        } else {
            _acceptAskOrder(orderOwner, cost, totalCost, amount, order.price);
        }

        // pay royalty
        __transfer(owner(), tax);
    }

    /**
     * accepting bid order
     * so caller is accepting to sell his share to order owner
     * -> escrow from order can be transferred to owner
     */
    function _acceptBidOrder(address orderOwner, uint256 cost, uint256 totalCost, uint256 amount, uint256 price) internal {
        require(shares[_msgSender()] >= amount,"E19");

        __transfer(_msgSender(), cost);
        swapShares(orderOwner, _msgSender(), amount);
        emit Trade(orderOwner, _msgSender(), amount, price);

        orders[orderOwner].escrow -= totalCost;
        escrow -= totalCost; // deduct from total escrow

        if (orders[orderOwner].amount == 0)
            _removeOrder(orderOwner);
    }


    function _acceptAskOrder(address orderOwner, uint256 cost, uint256 totalCost, uint256 amount, uint256 price) internal {
        require(shares[orderOwner] >= amount, "E19");

        __transferFrom(_msgSender(), address(this), totalCost);
        __transfer(orderOwner, cost);
        swapShares(_msgSender(), orderOwner, amount);
        emit Trade(_msgSender(), orderOwner, amount, price);

        // update offer
        if (orders[orderOwner].amount == 0)
            _removeOrder(orderOwner);
    }

    // Cancel order and return escrow
    function cancel() public virtual override  _tradingActive() {
        require(orders[_msgSender()].amount > 0, 'E20');

        Order memory _order = orders[_msgSender()];
        // return escrow leftover
        if (_order.bid)
            __transfer(_msgSender(), _order.escrow);

        // update bids
        _removeOrder(_msgSender());
    }

    // Pay usage charges
    function pay(uint256 amount) public payable override _tradingActive takeFee nonReentrant {
        require(trading, 'E21');
        require(!terminated, 'E22');
        require(amount > 0, 'E23');

        // check if enough escrow allowed and pull
        __allowance(_msgSender(), amount);
        __transferFrom(_msgSender(), address(this), amount);

        // pay tangible tax
        uint256 tangible = ((getRoyalty() * amount) / 1000);
        __transfer(owner(), tangible);

        emit Payment(_msgSender(), amount);
    }

    // TODO how often can this be called ??
    // Mark the current available value as disbursed
    // so shareholders can withdraw
    function disburse() public override _tradingActive returns (uint256) {
        uint256 balance = __balanceOf(address(this));

        // check if there is balance to disburse
        if (balance > escrow){
            balance -= escrow;
            balance -= totalDisbursed;

            disburseLevels.push(balance);
            totalDisbursed += balance;
        }

        return balance;
    }

    // Terminate this contract, and pay-out all remaining investors
    function terminate() public override onlyOwner returns (bool) {
        if (presale){
            disburseLevels.push(_totalSupply * presalePrice);
            totalDisbursed += _totalSupply * presalePrice;
        } else {
            disburse();
        }

        terminated = true;

        return terminated;
    }

    // ----------------------------------------------------------------------------------------------------------
    // -------------------------------------------- PUBLIC GETTERS ----------------------------------------------
    // ----------------------------------------------------------------------------------------------------------

    function withdraw() public payable nonReentrant {
        require(shares[_msgSender()] > 0, 'No shares available');
        require(shareholdersLevel[_msgSender()]<disburseLevels.length, "Nothing to disburse");

        // calculate and transfer claiming amount
        uint256 amount = (shares[_msgSender()] * disburseLevels[shareholdersLevel[_msgSender()]] / _totalSupply);
        __transfer(_msgSender(), amount);

        // increase shareholders disburse level
        shareholdersLevel[_msgSender()] += 1;
    }

    // ----------------------------------------------------------------------------------------------------------
    // -------------------------------------------- PUBLIC GETTERS ----------------------------------------------
    // ----------------------------------------------------------------------------------------------------------


    function getOrders() external view returns (address[] memory) {
        return orderAddresses;
    }

    function getOrderCount() public view returns (uint256){
        return orderAddresses.length;
    }

    // Get shares of one investor
    function balanceOf(address _owner) public view returns (uint256) {
        return getShares(_owner);
    }

    // Get shares of one investor
    function getShares(address _owner) public view returns (uint256) {
        if (orders[_owner].amount > 0){
            return shares[_owner] - orders[_owner].amount;
        } else
            return shares[_owner];
    }

    // Get shareholder addresses
    function getShareholders() public view returns (address[] memory) {
        return shareholders;
    }

    /**
    * @dev Returns the name of the token.
     */
    function name() public view returns (string memory) {
        return _name;
    }

    /**
     * @dev Returns the symbol of the token, usually a shorter version of the
     * name.
     */
    function symbol() public view returns (string memory) {
        return _symbol;
    }

    /**
     * @dev See {IERC20-totalSupply}.
     */
    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    /**
     * @dev Returns the number of decimals used to get its user representation.
     * For example, if `decimals` equals `2`, a balance of `505` tokens should
     * be displayed to a user as `5,05` (`505 / 10 ** 2`).
     *
     * Tokens usually opt for a value of 18, imitating the relationship between
     * Ether and Wei.
     *
     * NOTE: This information is only used for _display_ purposes: it in
     * no way affects any of the arithmetic of the contract, including
     * {IERC20-balanceOf} and {IERC20-transfer}.
     */
    function decimals() public view returns (uint8) {
        return _decimals;
    }


    // Function to receive Ether only allowed when contract Native Token
    receive() external payable {}

}
