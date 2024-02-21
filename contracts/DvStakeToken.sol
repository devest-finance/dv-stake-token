// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "./IStakeToken.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@devest/contracts/DvOrderBook.sol";

// DeVest Investment Model One
// Bid & Offer
contract DvStakeToken is DvOrderBook {

    // ---------------------------- EVENTS ------------------------------------

    // When payment was received
    event Payment(address indexed from, uint256 amount);

    // When payments been disbursed
    event Disbursed(uint256 amount);

    // ---------------------------- ERRORS --------------------------------

    // ---------------------------- STORAGE ----------------------------------

    // Stakes
    mapping (address => uint256) internal shareholdersLevel;        // level of disburse the shareholder withdraw
    mapping (address => uint256) internal shareholdersIndex;        // index of the shareholders address

    uint256[] public disburseLevels;    // Amount disburse in each level
    uint256 internal totalDisbursed;    // Total amount disbursed (not available anymore)


    // Set owner and DI OriToken
    constructor(address _tokenAddress, string memory __name, string memory __symbol, address _factory, address _owner)
        DvOrderBook(_tokenAddress, __name, __symbol, _factory, _owner){
    }

    // ----------------------------------------------------------------------------------------------------------
    // ------------------------------------------------ INTERNAL ------------------------------------------------
    // ----------------------------------------------------------------------------------------------------------


    function swapShares(address to, address from, uint256 amount) override internal  {
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
            shareholdersIndex[shareholders[shareholders.length-1]] = shareholdersIndex[from];
            shareholders.pop();
        }
    }

    // ----------------------------------------------------------------------------------------------------------
    // ------------------------------------------------- PUBLIC -------------------------------------------------
    // ----------------------------------------------------------------------------------------------------------

    /**
     *  Initialize TST as tangible
     */
    function initialize(uint tax, uint8 decimal) public override(DvOrderBook) nonReentrant onlyOwner atState(States.Created) virtual{
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


    function purchase(uint256 amount) public payable atState(States.Presale) nonReentrant override {
        require(block.timestamp >= presaleStart && block.timestamp <= presaleEnd, 'PreSale didn\'t start yet or ended already');
        require(amount > 0 && amount <= _totalSupply, 'Invalid amount submitted');
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
            state = States.Trading;
            __transfer(owner(), __balanceOf(address(this)));
        }
    }

    // ----------------------------------------------------------------------------------------------------------
    // ------------------------------------------------ TRADING -------------------------------------------------

    /**
    * Swap shares between owners,
    * Check for same level of disburse !!
    */
    function transfer(address recipient, uint256 amount) override(DvOrderBook) external payable takeFee nonReentrant notState(States.Created) notState(States.Presale) {
        require(amount > 0 && amount <= _totalSupply, 'Invalid amount submitted');
        if (shares[_msgSender()] != amount){
            if (shares[recipient] > 0){
                require(shareholdersLevel[_msgSender()] == shareholdersLevel[recipient], "Recipients or sender has pending disbursements!");
            }
        }

        swapShares(recipient, _msgSender(), amount);
    }

    // Pay usage charges
    function pay(uint256 amount) public payable atState(States.Trading) takeFee nonReentrant {
        require(amount > 0, 'Invalid amount provided');

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
    function disburse() public atState(States.Trading) nonReentrant {
        uint256 balance = __balanceOf(address(this));

        // check if there is balance to disburse
        if (balance > escrow){
            balance -= escrow;
            balance -= totalDisbursed;

            // Check if balance is 0, if so, nothing to disburse
            if (balance <= 0)
                return;

            disburseLevels.push(balance);
            totalDisbursed += balance;
        }

        emit Disbursed(balance);
    }

    // Terminate this contract, and pay-out all remaining investors
    function terminate() public override(DvOrderBook) onlyOwner notState(States.Terminated) {
        if (state == States.Presale){
            disburseLevels.push(_totalSupply * presalePrice);
            totalDisbursed += _totalSupply * presalePrice;
        } else {
            disburse();
        }

        state = States.Terminated;
    }

    function terminatePresale() public atState(States.Presale) notState(States.Terminated) {
        require(block.timestamp >= presaleEnd, 'Presale didn\'t end');
            disburseLevels.push(_totalSupply * presalePrice);
            totalDisbursed += _totalSupply * presalePrice;

        state = States.Terminated;
    }

    // ----------------------------------------------------------------------------------------------------------
    // -------------------------------------------- PUBLIC GETTERS ----------------------------------------------
    // ----------------------------------------------------------------------------------------------------------

    function withdraw() public payable override nonReentrant notState(States.Created) notState(States.Presale) {
        require(shares[_msgSender()] > 0, 'No shares available');
        require(shareholdersLevel[_msgSender()]<disburseLevels.length, "Nothing to disburse");

        // calculate and transfer claiming amount
        uint256 amount = (shares[_msgSender()] * disburseLevels[shareholdersLevel[_msgSender()]] / _totalSupply);
        __transfer(_msgSender(), amount);

        // remove reserved amount
        totalDisbursed -= amount;

        // increase shareholders disburse level
        shareholdersLevel[_msgSender()] += 1;
    }

    // ----------------------------------------------------------------------------------------------------------
    // -------------------------------------------- PUBLIC GETTERS ----------------------------------------------
    // ----------------------------------------------------------------------------------------------------------

    // Function to receive Ether only allowed when contract Native Token
    receive() override external payable {}

}
