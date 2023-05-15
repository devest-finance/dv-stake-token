// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/Context.sol";

/**
 * @dev Contract module which provides ownership and a revenue model the owner
 * can set a tax and a tax recipient the tax is taken from the sender and sent to the tax recipient
 *
 */
contract DvTax is Context {

    // controls the tax and recipient
    address internal _owner;

    // receives the paid tax
    address internal _taxRecipient;

    // the amount of tax to be paid in 1000%
    uint256 internal _tax = 0;

    /**
     * @dev Initializes the contract setting the deployer as the initial owner.
     */
    constructor(address __owner) {
        _owner = __owner;
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(_owner == _msgSender(), "Owner: caller is not the owner");
        _;
    }

    /**
     * @dev set the native fee, only owner
     */
    function setTax(uint256 __tax) public onlyOwner {
        require(__tax >= 0 && __tax <= 1000, 'E5');
        _tax = __tax;
    }

    /*
     * Set the tax beneficiary address, only owner
     */
    function setTaxReceiver(address __taxRecipient) public onlyOwner {
        _taxRecipient = __taxRecipient;
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        _owner = newOwner;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
      * @dev Returns the contracts tax
     */
    function getTax() public view virtual returns (uint256) {
        return _tax;
    }

}
