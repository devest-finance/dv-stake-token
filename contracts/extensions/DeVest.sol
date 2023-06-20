// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./DvFactory.sol";

/**
 * @dev Contract module which provides revenue (in terms of fee - transaction fees) model for a beneficiary
 * This module is used through inheritance. It will make available the modifier
 * `onlyHost`, which can be applied to your functions to restrict their use to
 * the host.
 *
 * @dev Contract module which provides ownership and a revenue model the owner
 * can set a royalty and a royalty recipient the royalty is taken from the sender
 * and sent to the royalty recipient
 */
contract DeVest is Context {

    // the models factory
    DvFactory internal _factory;

    // controls the royalty and recipient
    address internal _owner;

    // receives the paid royalty
    address internal _royaltyRecipient;

    // the amount of royalty to be paid in 1000%
    uint256 internal _royalty = 0;

    /**
     * @dev Initializes the contract by setting reference to its factory
     */
    constructor(address __owner, address factory) {
        _factory = DvFactory(factory);
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
     * Verify enough fee (value) was provided and take
     */
    modifier takeFee() {
        // check if factory is attached otherwise exit
        if (_factory == DvFactory(address(0)))
            return;

        address recipient;
        uint256 fee;

        // fetch fee and receiver
        (fee,recipient)= _factory.getFee();

        // check for fee and transfer to owner
        require(msg.value >= fee, "Please provide enough fee");
        payable(recipient).transfer(fee);
        _;
    }
    
    /**
     * @dev set the native royalty, only owner
     */
    function setRoyalty(uint256 __royalty) public onlyOwner {
        require(__royalty >= 0 && __royalty <= 1000, 'E5');
        _royalty = __royalty;
    }

    /*
     * Set the royalty recipient address, only owner
     */
    function setRoyaltyRecipient(address __royaltyRecipient) public onlyOwner {
        _royaltyRecipient = __royaltyRecipient;
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
      * @dev Returns the contracts royalty
     */
    function getRoyalty() public view virtual returns (uint256) {
        return _royalty;
    }

    /**
     * @dev Factory can detach itself from this contract
     */
    function detach() public virtual {
        require(address(_factory) == _msgSender(), "Only factory can detach itself");
        _factory = DvFactory(address(0));
    }

}
