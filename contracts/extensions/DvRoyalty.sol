// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/Context.sol";
import "../factory/IDvFactory.sol";

/**
 * @dev Contract module which provides revenue (in terms of royalty - transaction fees) model for a beneficiary
 * This module is used through inheritance. It will make available the modifier
 * `onlyHost`, which can be applied to your functions to restrict their use to
 * the host.
 */
contract DvRoyalty is Context {

    // the models factory
    IDvFactory internal _factory;

    /**
     * @dev Initializes the contract by setting reference to its factory
     */
    constructor(address factory) {
        _factory = IDvFactory(factory);
    }

    /**
     * Verify enough royalty (value) was provided and take
     */
    modifier takeRoyalty() {
        // check if factory is attached otherwise exit
        if (_factory == IDvFactory(address(0)))
           return;

        address recipient;
        uint256 royalty;

        // fetch royalty and receiver
        (royalty,recipient)= _factory.getRoyalty();

        // check for royalty and transfer to owner
        require(msg.value >= royalty, "Please provide enough royalty");
        payable(recipient).transfer(royalty);
        _;
    }

    /**
     * @dev Factory can detach itself from this contract
     */
    function detach() public virtual {
        require(address(_factory) == _msgSender(), "Royalty: caller is not the owner");
        _factory = IDvFactory(address(0));
    }

}
