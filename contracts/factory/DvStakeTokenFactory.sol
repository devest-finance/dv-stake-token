// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "../DvStakeToken.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


contract DvStakeTokenFactory is DvFactory {

    event deployed(address indexed issuer_address, address indexed contract_address);

    constructor() DvFactory() {}

    /**
     * @dev detach a token from this factory
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
        // take fee
        require(msg.value >= _issueFee, "Please provide enough fee");
        if (_issueFee > 0)
            payable(_feeRecipient).transfer(_issueFee);

        // issue
        DvStakeToken token = new DvStakeToken(_tokenAddress, name, symbol, address(this), _msgSender());

        emit deployed(_msgSender(), address(token));
    }

}
