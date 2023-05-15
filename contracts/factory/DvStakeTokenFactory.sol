// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../DvStakeToken.sol";
import "../extensions/IDvFactory.sol";

contract DvStakeTokenFactory is IDvFactory, Ownable {

    event deployed(address indexed issuer_address, address indexed contract_address);

    // Disable this factory in case of problems or deprecation
    bool private active = true;

    // Recipient of royalty
    address private _royaltyRecipient;

    // Royalty for issuing tokens
    uint256 private _royalty = 0;
    // Royalty for issued models
    uint256 private _issueRoyalty = 0;

    constructor() Ownable() {}

    /**
     * Verify factory is still active
     */
    modifier isActive() {
        require(active, "Factory was terminated");
        _;
    }

    /// @notice set the current royalty fee
    function setRoyalty(uint256 royalty, uint256 issueRoyalty) external override onlyOwner {
        _royalty = royalty;
        _issueRoyalty = issueRoyalty;
    }

    /// @notice set the current royalty recipient
    function setRecipient(address recipient) external override onlyOwner {
        _royaltyRecipient = recipient;
    }

    /**
      * @dev de-tach a token from this factory
     */
    function detach(address payable _tokenAddress) external payable onlyOwner {
        DvStakeToken token = DvStakeToken(_tokenAddress);
        token.detach();
    }

    /**
    * @dev Throws if called by any account other than the owner.
    */
    function issue(address _tokenAddress, string memory name, string memory symbol) public payable isActive
    {
        // take royalty
        require(msg.value >= _issueRoyalty, "Please provide enough royalty");
        if (_issueRoyalty > 0)
            payable(_royaltyRecipient).transfer(_issueRoyalty);

        // issue
        DvStakeToken token = new DvStakeToken(_tokenAddress, name, symbol, address(this), _msgSender());

        emit deployed(_msgSender(), address(token));
    }

    /// @notice Get current royalty fee and address
    function getRoyalty() external override view returns (uint256, address) {
        return (_royalty, _royaltyRecipient);
    }

    // disable this deployer for further usage
    function terminate() public onlyOwner {
        active = false;
    }

}
