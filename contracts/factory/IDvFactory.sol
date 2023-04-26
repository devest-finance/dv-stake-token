// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

/**
 * @dev Interface of the DvFactory contract for issuing DvStakeToken
 */
interface IDvFactory {

    /// @notice Get current royalty fee and address
    function getRoyalty() external view returns (uint256, address);

    /// @notice terminate this factory and disable further usage
    function terminate() external;

    /// @notice set the current royalty fee
    function setRoyalty(uint256 royalty, uint256 issueRoyalty) external;

    /// @notice set the current royalty recipient
    function setRecipient(address recipient) external;

}
