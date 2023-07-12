// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

/**
 * @dev Interface of first draft of Tangible Stake Token - TST
 */
interface IStakeToken {

    // Bid a price for shares, (shareholder accepts bid to swap)
    function buy(uint256 price, uint256 amount) payable external;

    // Ask for a price, (shareholder offers share to respective price)
    function sell(uint256 price, uint256 amount) payable external;

    // Accept bid and sell shares
    function accept(address bidder, uint256 amount) external payable;

    // Transfer shares
    function transfer(address recipient, uint256 amount) external payable;

    // Cancel all orders from this address
    function cancel() external;

    // Pay charges or costs
    function pay(uint256 amount) payable external;

    // Disburse funds
    function disburse() external;

    // Terminate
    function terminate() external;

}
