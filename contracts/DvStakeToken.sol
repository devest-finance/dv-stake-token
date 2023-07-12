// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "./IStakeToken.sol";
import "./extensions/DeVest.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

// DeVest Investment Model One
// Bid & Offer
contract DvStakeToken is IStakeToken, ReentrancyGuard, Context, DeVest {

    // ---------------------------- EVENTS ------------------------------------

    // When an shareholder exchanged his shares
    event Trade(address indexed from, address indexed to, uint256 quantity, uint256 price);

    // When payment was received
    event Payment(address indexed from, uint256 amount);

    // When payments been disbursed
    event Disbursed(uint256 amount);

    // ---------------------------- ERRORS --------------------------------

    // ---------------------------- STORAGE ----------------------------------

    enum States {
        Created,
        Presale,
        Trading,
        Terminated
    }

    States public state = States.Created;

    uint256 public presalePrice = 0;    // price per share
    uint256 public presaleShares = 0;   // total shares available for presale
    uint256 public presaleStart = 0;    // start date of presale
    uint256 public presaleEnd = 0;      // end date of presale

    /**
      *  Order struct
      *  @param index - index of the order
      *  @param price - price of the order
      *  @param amount - amount of shares
      *  @param escrow - amount in escrow
      *  @param bid - true = buy | false = sell
      */
    struct Order {
        uint256 index;
        uint256 price;
        uint256 amount;
        uint256 escrow;
        bool bid; // buy = true | sell = false
    }
    mapping (address => Order) public orders;  // all orders
    address[] public orderAddresses;       // all order addresses

    // Total amount in escrow
    uint256 public escrow;

    // Stakes
    address[] internal shareholders;                                // all current shareholders
    mapping (address => uint256) internal shares;                   // shares of shareholder
    mapping (address => uint256) internal shareholdersLevel;        // level of disburse the shareholder withdraw
    mapping (address => uint256) internal shareholdersIndex;        // index of the shareholders address

    uint256[] public disburseLevels;    // Amount disburse in each level
    uint256 internal totalDisbursed;    // Total amount disbursed (not available anymore)

    // metadata
    string private _name;           // name of the tangible
    string private _symbol;         // symbol of the tangible
    uint8 private _decimals;        // decimals of the tangible
    uint256 private _totalSupply;   // total supply of shares (10^decimals)

    // - Vesting / Trading token reference
    IERC20 private _token;

    // Set owner and DI OriToken
    constructor(address _tokenAddress, string memory __name, string memory __symbol, address _factory, address _owner) DeVest(_owner, _factory) {
        _token =  IERC20(_tokenAddress);
        _symbol = string(abi.encodePacked("% ", __symbol));
        _name = __name;
    }

    // ----------------------------------------------------------------------------------------------------------
    // ----------------------------------------------- MODIFIERS ------------------------------------------------
    // ----------------------------------------------------------------------------------------------------------

    /**
    *  Verify required state
    *
    */
    modifier atState(States _state) {
        require(state == _state, "Not available in current state");
        _;
    }

    modifier notState(States _state) {
        require(state != _state, "Not available in current state");
        _;
    }

    /**
     *  Internal token allowance
     */
    function __allowance(address account, uint256 amount) internal view {
        require(_token.allowance(account, address(this)) >= amount, 'Insufficient allowance provided');
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
    function initialize(uint tax, uint8 decimal) public onlyOwner atState(States.Created) virtual{
        require(tax >= 0 && tax <= 1000, 'Invalid tax value');
        require(decimal >= 0 && decimal <= 10, 'Max 16 decimals');

        // set attributes
        _decimals = decimal += 2;
        _setRoyalties(tax, owner());

        // assign to publisher all shares
        _totalSupply = (10 ** _decimals);
        shares[_msgSender()] = _totalSupply;

        // Initialize owner as only shareholder
        shareholders.push(_msgSender());
        shareholdersIndex[_msgSender()] = 0;
        shareholdersLevel[_msgSender()] = 0;

        // start trading
        state = States.Trading;
    }

    /**
      * optional initialization will not assign 100% to the owner, rather allow a kind of presale in which
      * the owner can sell a certain amount of shares to a certain price and after all shares are sold
      * the contract will be initialized.
      */
     function initializePresale(uint tax, uint8 decimal, uint256 price, uint256 start, uint256 end)
     public onlyOwner atState(States.Created) virtual{
         require(tax >= 0 && tax <= 1000, 'Invalid tax value');
         require(decimal >= 0 && decimal <= 10, 'Max 16 decimals');

         // set attributes
         _decimals = decimal += 2;
         _setRoyalties(tax, owner());
         _totalSupply = (10 ** _decimals);

         state = States.Presale;
         presalePrice = price;
         presaleStart = start;
         presaleEnd = end;
     }

    function purchase(uint256 amount) public payable atState(States.Presale) virtual{
        require(block.timestamp >= presaleStart && block.timestamp <= presaleEnd, 'PreSale didn\'t start yet or ended already');
        require(amount > 0 && amount <= _totalSupply, 'Invalid amount submitted');
        require(presaleShares + amount <= _totalSupply, 'Not enough shares left to purchase');

        // check if enough escrow allowed and pick the cash
        __allowance(_msgSender(), amount * presalePrice);
        _token.transferFrom(_msgSender(), address(this), amount * presalePrice);

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
            state = States.Trading;
            _token.transfer(owner(), _token.balanceOf(address(this)));
        }
    }

    // ----------------------------------------------------------------------------------------------------------
    // ------------------------------------------------ TRADING -------------------------------------------------

    /**
    * Swap shares between owners,
    * Check for same level of disburse !!
    */
    function transfer(address recipient, uint256 amount) external payable takeFee nonReentrant notState(States.Created) notState(States.Presale) {
        require(amount > 0 && amount <= _totalSupply, 'Invalid amount submitted');
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
    function buy(uint256 _price, uint256 amount) public payable virtual override nonReentrant atState(States.Trading) {
        require(amount > 0 && amount <= _totalSupply, 'Invalid amount submitted');
        require(_price > 0, 'Invalid price submitted');
        require(orders[_msgSender()].amount == 0, 'Active buy order, cancel first');

        // add tax to escrow
        uint256 _escrow = (_price * amount) + (_price * amount * getRoyalty()) / 1000;

        // check if enough escrow allowed
        __allowance(_msgSender(), _escrow);

        // store bid
        orders[_msgSender()] = Order(orderAddresses.length, _price, amount, _escrow, true);
        orderAddresses.push(_msgSender());

        // pull escrow
        _token.transferFrom(_msgSender(), address(this), _escrow);
        escrow += _escrow;
    }

    /**
     *  Sell order
     */
    function sell(uint256 _price, uint256 amount) public payable override nonReentrant atState(States.Trading) {
        require(amount > 0 && amount <= _totalSupply, 'Invalid amount submitted');
        require(_price > 0, 'Invalid price submitted');
        require(shares[_msgSender()]  > 0, 'Insufficient shares');
        require(orders[_msgSender()].amount == 0, 'Active order, cancel first');

        // store bid
        orders[_msgSender()] = Order(orderAddresses.length, _price, amount, 0, false);
        orderAddresses.push(_msgSender());
    }

    /**
     *  Accept order
     */
    function accept(address orderOwner, uint256 amount) external override payable nonReentrant atState(States.Trading) takeFee {
        require(amount > 0, "Invalid amount submitted");
        require(orders[orderOwner].amount >= amount, "Invalid order");
        require(_msgSender() != orderOwner, "Can't accept your own order");

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
        _token.transfer(owner(), tax);
    }

    /**
     * accepting bid order
     * so caller is accepting to sell his share to order owner
     * -> escrow from order can be transferred to owner
     */
    function _acceptBidOrder(address orderOwner, uint256 cost, uint256 totalCost, uint256 amount, uint256 price) internal {
        require(shares[_msgSender()] >= amount,"Insufficient shares");

        _token.transfer(_msgSender(), cost);
        swapShares(orderOwner, _msgSender(), amount);
        emit Trade(orderOwner, _msgSender(), amount, price);

        orders[orderOwner].escrow -= totalCost;
        escrow -= totalCost; // deduct from total escrow

        if (orders[orderOwner].amount == 0)
            _removeOrder(orderOwner);
    }


    function _acceptAskOrder(address orderOwner, uint256 cost, uint256 totalCost, uint256 amount, uint256 price) internal {
        require(shares[orderOwner] >= amount, "Insufficient shares");

        _token.transferFrom(_msgSender(), address(this), totalCost);
        _token.transfer(orderOwner, cost);
        swapShares(_msgSender(), orderOwner, amount);
        emit Trade(_msgSender(), orderOwner, amount, price);

        // update offer
        if (orders[orderOwner].amount == 0)
            _removeOrder(orderOwner);
    }

    // Cancel order and return escrow
    function cancel() public virtual override notState(States.Presale) {
        require(orders[_msgSender()].amount > 0, 'Invalid order');

        Order memory _order = orders[_msgSender()];
        // return escrow leftover
        if (_order.bid)
            _token.transfer(_msgSender(), _order.escrow);

        // update bids
        _removeOrder(_msgSender());
    }

    // Pay usage charges
    function pay(uint256 amount) public payable override atState(States.Trading) takeFee nonReentrant {
        require(amount > 0, 'Invalid amount provided');

        // check if enough escrow allowed and pull
        __allowance(_msgSender(), amount);
        _token.transferFrom(_msgSender(), address(this), amount);

        // pay tangible tax
        uint256 tangible = ((getRoyalty() * amount) / 1000);
        _token.transfer(owner(), tangible);

        emit Payment(_msgSender(), amount);
    }

    // TODO how often can this be called ??
    // Mark the current available value as disbursed
    // so shareholders can withdraw
    function disburse() public override atState(States.Trading) {
        uint256 balance = _token.balanceOf(address(this));

        // check if there is balance to disburse
        if (balance > escrow){
            balance -= escrow;
            balance -= totalDisbursed;

            disburseLevels.push(balance);
            totalDisbursed += balance;
        }

        emit Disbursed(balance);
    }

    // Terminate this contract, and pay-out all remaining investors
    function terminate() public override onlyOwner notState(States.Terminated) {
        if (state == States.Presale){
            disburseLevels.push(_totalSupply * presalePrice);
            totalDisbursed += _totalSupply * presalePrice;
        } else {
            disburse();
        }

        state = States.Terminated;
    }

    // ----------------------------------------------------------------------------------------------------------
    // -------------------------------------------- PUBLIC GETTERS ----------------------------------------------
    // ----------------------------------------------------------------------------------------------------------

    function withdraw() public payable nonReentrant notState(States.Created) notState(States.Presale) {
        require(shares[_msgSender()] > 0, 'No shares available');
        require(shareholdersLevel[_msgSender()]<disburseLevels.length, "Nothing to disburse");

        // calculate and transfer claiming amount
        uint256 amount = (shares[_msgSender()] * disburseLevels[shareholdersLevel[_msgSender()]] / _totalSupply);
        _token.transfer(_msgSender(), amount);

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
