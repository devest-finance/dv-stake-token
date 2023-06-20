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
    event swapped(address indexed from, address indexed to, uint256 share, uint256 totalCost);

    // When new buy order was submitted and awaits acceptance
    event ordered(address indexed from, uint256 price, uint256 amount, bool bid);

    // When payment was received
    event payment(address indexed from, uint256 amount);

    // When dividends been disbursed
    event disbursed(uint256 amount);

    // ---------------------------- ERRORS --------------------------------


    // ---------------------------------------------------------------------


    // contract was terminated and can't be used anymore
    bool public terminated = false;

    // initialized
    bool internal initialized = false;

    // Last price which was accepted in order book per unit
    uint256 public value = 0;

    // Offers
    struct Order {
        uint256 index;
        uint256 price;
        uint256 amount;
        uint256 escrow;
        bool bid; // buy = true | sell = false
    }
    mapping (address => Order) public orders;
    address[] public orderAddresses;


    uint256 public escrow;

    // Stakes
    mapping (address => uint256) internal shares;                   // shares of shareholder
    mapping (address => uint256) internal shareholdersLevel;        // level of disburse the shareholder withdraw
    mapping (address => uint256) internal shareholdersIndex;        // index of the shareholders address
    address[] internal shareholders;                                // all current shareholders

    uint256[] public disburseLevels;    // Amount disburse in each level
    uint256 internal totalDisbursed;    // Total amount disbursed (not available anymore)

    // metadata
    string private _name;
    string private _symbol;
    uint8 private _decimals;
    uint256 private _totalSupply;

    // ---- assets

    // assets added to this fund
    struct Asset {
        address token;
        uint256 amount;
        uint256 disbursed;
    }
    Asset[] public assets;

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
    modifier _isActive() {
        require(initialized, 'E1');
        require(!terminated, 'E2');
        _;
    }

    // ----------------------------------------------------------------------------------------------------------
    // ------------------------------------------------ INTERNAL ------------------------------------------------
    // ----------------------------------------------------------------------------------------------------------

    /**
    *  Update stored bids, if bid was spend, remove from list
    */
    function deductAmountfromOrder(address orderOwner, uint256 amount) internal {
        require(orders[orderOwner].amount >= amount, "Insufficient funds");

        orders[orderOwner].amount -= amount;
        uint256 totalPrice = orders[orderOwner].price * amount;

        // in case of bid deduct escrow
        if (orders[orderOwner].bid == true){
            uint256 escrowDeduct = totalPrice + ((totalPrice * getRoyalty()) / 1000);
            orders[orderOwner].escrow -= escrowDeduct;
            escrow -= escrowDeduct; // deduct from total escrow
        }

        if (orders[orderOwner].amount == 0){
            uint256 index = orders[orderOwner].index;
            orderAddresses[index] = orderAddresses[orderAddresses.length-1];
            orders[orderAddresses[orderAddresses.length-1]].index = index;
            orderAddresses.pop();
        }
    }

    function swapShares(address to, address from, uint256 amount) internal {
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
    function initialize(uint256 amount, uint tax, uint8 decimal) public virtual returns (bool){
        require(!initialized, 'E3');
        require(owner() == _msgSender(), 'E4');
        require(tax >= 0 && tax <= 1000, 'E5');
        require(amount >= (10 ** decimal), 'E8');
        require(decimal >= 0 && decimal <= 10, 'Max 16 decimals');

        // set attributes
        _decimals = decimal += 2;
        value = amount;
        setRoyalty(tax);

        // assign to publisher all shares
        shares[_msgSender()] = (10 ** _decimals);
        _totalSupply = (10 ** _decimals);

        // start bidding
        initialized = true;

        return true;
    }

    // ----------------------------------------------------------------------------------------------------------
    // ------------------------------------------------ TRADING -------------------------------------------------

    /**
    * Swap shares between owners,
    * Check for same level of disburse !!
    */
    function transfer(address recipient, uint256 amount) external payable takeFee {
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
    function buy(uint256 _price, uint256 amount) public payable virtual override nonReentrant _isActive{
        require(amount > 0 && amount <= (10 ** _decimals), 'E9');
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

        emit ordered(_msgSender(), _price, amount, true);
    }

    /**
     *  Sell order
     */
    function sell(uint256 _price, uint256 amount) public payable override nonReentrant _isActive {
        require(amount > 0 && amount <= (10 ** _decimals), 'E12');
        require(_price > 0, 'E13');
        require(shares[_msgSender()]  > 0, 'E14');
        require(orders[_msgSender()].amount == 0, 'E15');

        // store bid
        orders[_msgSender()] = Order(orderAddresses.length, _price, amount, 0, false);
        orderAddresses.push(_msgSender());

        emit ordered(_msgSender(), _price, amount, false);
    }

    /**
     *  Accept order
     */
    function accept(address orderOwner, uint256 amount) external override payable nonReentrant _isActive takeFee{
        require(amount > 0, "E16");
        require(orders[orderOwner].amount >= amount, "E17");
        require(_msgSender() != orderOwner, "E18");

        Order memory order = orders[orderOwner];

        // In case of bid, check if owner has enough shares
        if (order.bid == true)
            require(shares[_msgSender()] >= amount,"E19");
        else
            require(shares[orderOwner] >= amount, "E19");

        // calculate taxes
        uint256 cost = order.price * amount;
        uint256 tax = (cost * getRoyalty()) / 1000;
        uint256 totalCost = cost + tax;

        // accepting on bid order
        if (order.bid == true) {
            // accepting bid order
            // so caller is accepting to sell his share to order owner
            // -> escrow from order can be transferred to owner
            __transfer(_msgSender(), cost);
        } else {
            // what the buyer needs to pay (including taxes)
            __transferFrom(_msgSender(), address(this), totalCost);
            __transfer(orderOwner, cost);
        }

        // pay tangibles
        if (tax != 0)
            __transfer(owner(), tax);

        // TODO cover different event when accepting bid/ask
        // msg sender is accepting sell order
        if (order.bid == false) {
            swapShares(_msgSender(), orderOwner, amount);
        } else {
            // msg sender is accepting buy order
            swapShares(orderOwner, _msgSender(), amount);
        }

        // update offer
        deductAmountfromOrder(orderOwner, amount);

        // update last transaction price (uint)
        //price = order.price;
        value = ((value*(100-amount))/100) + cost;

        // TODO cover different event when accepting bid/ask
        emit swapped(_msgSender(), orderOwner, amount, totalCost);
    }

    // Cancel order and return escrow
    function cancel() public virtual override _isActive() returns (bool) {
        require(orders[_msgSender()].amount > 0, 'E20');

        Order memory _order = orders[_msgSender()];
        // return escrow leftover
        if (_order.bid)
            __transfer(_msgSender(), _order.escrow);

        // update bids
        deductAmountfromOrder(_msgSender(), _order.amount);

        return true;
    }

    // Pay usage charges
    function pay(uint256 amount) public payable override _isActive takeFee nonReentrant {
        require(initialized, 'E21');
        require(!terminated, 'E22');
        require(amount > 0, 'E23');

        // check if enough escrow allowed and pull
        __allowance(_msgSender(), amount);
        __transferFrom(_msgSender(), address(this), amount);

        // pay tangible tax
        uint256 tangible = ((getRoyalty() * amount) / 1000);
        __transfer(owner(), tangible);

        emit payment(_msgSender(), amount);
    }

    // TODO how often can this be called ??
    // Mark the current available value as disbursed
    // so shareholders can withdraw
    function disburse() public override _isActive returns (uint256) {
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
    function terminate() public override _isActive()  returns (bool) {
        require(owner() == _msgSender(), 'E25');

        // terminate contract
        disburse();
        terminated = true;

        return terminated;
    }

    // ----------------------------------------------------------------------------------------------------------
    // -------------------------------------------- PUBLIC GETTERS ----------------------------------------------
    // ----------------------------------------------------------------------------------------------------------

    /**
    *  Add a token to the fund
    *  token: address of token to add
    *  amount: amount to add
    */
    function addAsset(address token, uint256 amount) public payable virtual nonReentrant {
        require(token != _vestingToken, "Vesting token cannot be added as Asset");
        require(!initialized, 'Tangible already initialized');
        require(amount >= 0, 'Invalid amount');

        IERC20 _token = IERC20(token);

        // transfer assets to this contract
        _token.transferFrom(_msgSender(), address(this), amount);

        assets.push(Asset(token, amount, 0));
    }

    function withdraw() public payable nonReentrant{
        require(shares[_msgSender()] > 0, 'No shares available');

        // check assets attached then withdraw is possible
        if (assets.length > 0)
            _withdrawWithAssets();
        else
            _withdrawDividends();
    }

    /**
    *  Withdraw amount of balance collected in TST
    *  in amount of the shares of shareholder
    */
    function _withdrawDividends() private{
        require(shareholdersLevel[_msgSender()]<disburseLevels.length, "Nothing to disburse");

        // calculate and transfer claiming amount
        uint256 amount = (shares[_msgSender()] * disburseLevels[shareholdersLevel[_msgSender()]] / (10 ** _decimals));
        __transfer(_msgSender(), amount);

        // increase shareholders disburse level
        shareholdersLevel[_msgSender()] += 1;
    }

    /**
    *  Withdraw all assets contained in this TST, in amount
    *  the shareholders share
    */
    function _withdrawWithAssets() private{
        require(terminated, 'Withdraw is only possible after termination');

        for(uint256 i=0;i<assets.length;i++){
            IERC20 _token = IERC20(assets[i].token);
            uint256 amount = ((shares[_msgSender()] * assets[i].amount) / (10 ** _decimals));
            _token.transfer(_msgSender(), amount);
        }

        shares[_msgSender()] = 0;
    }

    // ----------------------------------------------------------------------------------------------------------
    // -------------------------------------------- PUBLIC GETTERS ----------------------------------------------
    // ----------------------------------------------------------------------------------------------------------

    struct AssetInfo {
        address token;
        uint256 balance;
    }

    function getAssetBalance() public view returns (AssetInfo[] memory){
        AssetInfo[] memory _assets = new AssetInfo[](assets.length);

        for(uint256 i=0;i<assets.length;i++){
            IERC20 _token = IERC20(assets[i].token);
            _assets[i] = AssetInfo(assets[i].token, _token.balanceOf(address(this)));
        }

        return _assets;
    }

    function getOrders() external view returns (address[] memory) {
        return orderAddresses;
    }

    function getOrderCount() public view returns (uint256){
        return orderAddresses.length;
    }

    // Get shares of one investor
    function balanceOf(address _owner) public view returns (uint256) {
        return shares[_owner];
    }

    // Get shares of one investor
    function getShares(address _owner) public view returns (uint256) {
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
