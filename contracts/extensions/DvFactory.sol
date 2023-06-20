// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/Context.sol";

/**
 * @dev Interface of the DvFactory contract for issuing DvVest extended Contracts
 */
abstract contract DvFactory is Context {

    // Disable this factory in case of problems or deprecation
    bool private active = true;

    // owner (publisher) of this factory
    address internal _owner;

    // Recipient of fee
    address internal _feeRecipient;

    // Fee on deployed models
    uint256 private _fee = 0;

    // Fee for issuing model
    uint256 internal _issueFee = 0;

    constructor(){
        _owner = _msgSender();
    }

    /**
    * Verify factory is still active
    */
    modifier isActive() {
        require(active, "Factory was terminated");
        _;
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(_owner == _msgSender(), "Owner: caller is not the owner");
        _;
    }

    // ----

    /// @notice set the current royalty fee
    function setFee(uint256 fee, uint256 issueFee) external onlyOwner {
        _fee = fee;
        _issueFee = issueFee;
    }

    /// @notice Get current royalty fee and address
    function getFee() external view returns (uint256, address) {
        return (_fee, _feeRecipient);
    }

    /// @notice set the fee recipient
    function setRecipient(address recipient) external onlyOwner {
        _feeRecipient = recipient;
    }

    /// @notice get the fee recipient
    function getRecipient() public view returns (address){
        return _feeRecipient;
    }

    // disable this deployer for further usage
    function terminate() public onlyOwner {
        active = false;
    }

}
