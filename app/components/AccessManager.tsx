"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { CONTRACTS, ROLES } from "../config";
import { useToast } from "../contexts/ToastContext";

const ACCESS_MANAGER_ABI = [
    "function addAdmin(address _admin) external",
    "function removeAdmin(address _admin) external",
    "function addMultisigAdmin(address _multisigAdmin) external",
    "function removeMultisigAdmin(address _multisigAdmin) external",
    "function addEIP712Swapper(address _swapper) external",
    "function removeEIP712Swapper(address _swapper) external",
    "function isAdmin(address _address) view returns (bool)",
    "function isMultisigAdmin(address _address) view returns (bool)",
    "function isEIP712Swapper(address _address) view returns (bool)",
    "function hasRole(bytes32 role, address account) view returns (bool)",
    "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
] as const;

// Standard OpenZeppelin AccessControl ABI for granting roles on any contract
const ACCESS_CONTROL_ABI = [
    "function grantRole(bytes32 role, address account) external",
    "function revokeRole(bytes32 role, address account) external",
    "function hasRole(bytes32 role, address account) view returns (bool)",
    "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
] as const;

type RoleType = "admin" | "multisigAdmin" | "eip712Swapper";

interface RoleInfo {
    address: string;
    isAdmin: boolean;
    isMultisigAdmin: boolean;
    isEIP712Swapper: boolean;
}

export default function AccessManagerComponent() {
    const [isDefaultAdmin, setIsDefaultAdmin] = useState<boolean | null>(null);
    const [addressToCheck, setAddressToCheck] = useState("");
    const [roleInfo, setRoleInfo] = useState<RoleInfo | null>(null);
    const [newAddress, setNewAddress] = useState("");
    const [selectedRole, setSelectedRole] = useState<RoleType>("admin");
    const [loading, setLoading] = useState(false);
    const [checkLoading, setCheckLoading] = useState(false);

    // For granting roles on any contract (e.g., pool contracts)
    const [targetContract, setTargetContract] = useState("");
    const [targetContractAdmin, setTargetContractAdmin] = useState<boolean | null>(null);
    const [roleToGrant, setRoleToGrant] = useState<string>(ROLES.ADMIN_ROLE);
    const [addressToGrant, setAddressToGrant] = useState("");
    const [targetContractLoading, setTargetContractLoading] = useState(false);

    const { showToast } = useToast();

    const checkDefaultAdmin = useCallback(async () => {
        if (typeof window.ethereum === "undefined") {
            setIsDefaultAdmin(false);
            return;
        }

        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const accessManager = new ethers.Contract(CONTRACTS.ACCESS_MANAGER, ACCESS_MANAGER_ABI, provider);
            const signer = await provider.getSigner();
            const userAddress = await signer.getAddress();
            const hasRole = await accessManager.hasRole(ROLES.DEFAULT_ADMIN_ROLE, userAddress);
            setIsDefaultAdmin(hasRole);
        } catch (error) {
            console.error("Error checking default admin:", error);
            setIsDefaultAdmin(false);
        }
    }, []);

    useEffect(() => {
        checkDefaultAdmin();
    }, [checkDefaultAdmin]);

    const checkAddressRoles = async () => {
        if (!addressToCheck || !ethers.isAddress(addressToCheck)) {
            showToast("Please enter a valid address", "warning");
            return;
        }

        if (typeof window.ethereum === "undefined") {
            showToast("Please install MetaMask!", "error");
            return;
        }

        setCheckLoading(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const accessManager = new ethers.Contract(CONTRACTS.ACCESS_MANAGER, ACCESS_MANAGER_ABI, provider);

            const [isAdmin, isMultisigAdmin, isEIP712Swapper] = await Promise.all([
                accessManager.isAdmin(addressToCheck),
                accessManager.isMultisigAdmin(addressToCheck),
                accessManager.isEIP712Swapper(addressToCheck),
            ]);

            setRoleInfo({
                address: addressToCheck,
                isAdmin,
                isMultisigAdmin,
                isEIP712Swapper,
            });
        } catch (error) {
            console.error("Error checking roles:", error);
            showToast("Failed to check roles", "error");
        } finally {
            setCheckLoading(false);
        }
    };

    const handleAddRole = async () => {
        if (!newAddress || !ethers.isAddress(newAddress)) {
            showToast("Please enter a valid address", "warning");
            return;
        }

        if (isDefaultAdmin === false) {
            showToast("You must have DEFAULT_ADMIN_ROLE to manage roles", "error");
            return;
        }

        if (typeof window.ethereum === "undefined") {
            showToast("Please install MetaMask!", "error");
            return;
        }

        setLoading(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const accessManager = new ethers.Contract(CONTRACTS.ACCESS_MANAGER, ACCESS_MANAGER_ABI, signer);

            let tx;
            switch (selectedRole) {
                case "admin":
                    tx = await accessManager.addAdmin(newAddress);
                    break;
                case "multisigAdmin":
                    tx = await accessManager.addMultisigAdmin(newAddress);
                    break;
                case "eip712Swapper":
                    tx = await accessManager.addEIP712Swapper(newAddress);
                    break;
            }

            showToast("Transaction submitted...", "info");
            await tx.wait();
            showToast(`${selectedRole === "admin" ? "Admin" : selectedRole === "multisigAdmin" ? "Multisig Admin" : "EIP712 Swapper"} role granted!`, "success");
            setNewAddress("");
            if (addressToCheck === newAddress) {
                await checkAddressRoles();
            }
        } catch (error) {
            console.error("Error adding role:", error);
            const message = error instanceof Error ? error.message : "Unknown error";
            showToast(`Failed: ${message}`, "error");
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveRole = async (role: RoleType) => {
        if (!roleInfo) return;

        if (isDefaultAdmin === false) {
            showToast("You must have DEFAULT_ADMIN_ROLE to manage roles", "error");
            return;
        }

        if (typeof window.ethereum === "undefined") {
            showToast("Please install MetaMask!", "error");
            return;
        }

        setLoading(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const accessManager = new ethers.Contract(CONTRACTS.ACCESS_MANAGER, ACCESS_MANAGER_ABI, signer);

            let tx;
            switch (role) {
                case "admin":
                    tx = await accessManager.removeAdmin(roleInfo.address);
                    break;
                case "multisigAdmin":
                    tx = await accessManager.removeMultisigAdmin(roleInfo.address);
                    break;
                case "eip712Swapper":
                    tx = await accessManager.removeEIP712Swapper(roleInfo.address);
                    break;
            }

            showToast("Transaction submitted...", "info");
            await tx.wait();
            showToast(`Role removed!`, "success");
            await checkAddressRoles();
        } catch (error) {
            console.error("Error removing role:", error);
            const message = error instanceof Error ? error.message : "Unknown error";
            showToast(`Failed: ${message}`, "error");
        } finally {
            setLoading(false);
        }
    };

    const checkTargetContractAdmin = useCallback(async () => {
        if (!targetContract || !ethers.isAddress(targetContract)) {
            setTargetContractAdmin(null);
            return;
        }

        if (typeof window.ethereum === "undefined") {
            setTargetContractAdmin(false);
            return;
        }

        setTargetContractLoading(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const contract = new ethers.Contract(targetContract, ACCESS_CONTROL_ABI, provider);
            const signer = await provider.getSigner();
            const userAddress = await signer.getAddress();

            // Check if user has DEFAULT_ADMIN_ROLE on the target contract
            const defaultAdminRole = await contract.DEFAULT_ADMIN_ROLE();
            const hasRole = await contract.hasRole(defaultAdminRole, userAddress);
            setTargetContractAdmin(hasRole);
        } catch (error) {
            console.error("Error checking target contract admin:", error);
            setTargetContractAdmin(false);
        } finally {
            setTargetContractLoading(false);
        }
    }, [targetContract]);

    useEffect(() => {
        checkTargetContractAdmin();
    }, [checkTargetContractAdmin]);

    const handleGrantRoleOnContract = async () => {
        if (!targetContract || !ethers.isAddress(targetContract)) {
            showToast("Please enter a valid contract address", "warning");
            return;
        }

        if (!addressToGrant || !ethers.isAddress(addressToGrant)) {
            showToast("Please enter a valid address to grant role to", "warning");
            return;
        }

        if (targetContractAdmin === false) {
            showToast("You must have DEFAULT_ADMIN_ROLE on the target contract", "error");
            return;
        }

        if (typeof window.ethereum === "undefined") {
            showToast("Please install MetaMask!", "error");
            return;
        }

        setLoading(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(targetContract, ACCESS_CONTROL_ABI, signer);

            const tx = await contract.grantRole(roleToGrant, addressToGrant);
            showToast("Transaction submitted...", "info");
            await tx.wait();
            showToast("Role granted successfully!", "success");
            setAddressToGrant("");
        } catch (error) {
            console.error("Error granting role:", error);
            const message = error instanceof Error ? error.message : "Unknown error";
            showToast(`Failed: ${message}`, "error");
        } finally {
            setLoading(false);
        }
    };

    const handleRevokeRoleOnContract = async () => {
        if (!targetContract || !ethers.isAddress(targetContract)) {
            showToast("Please enter a valid contract address", "warning");
            return;
        }

        if (!addressToGrant || !ethers.isAddress(addressToGrant)) {
            showToast("Please enter a valid address to revoke role from", "warning");
            return;
        }

        if (targetContractAdmin === false) {
            showToast("You must have DEFAULT_ADMIN_ROLE on the target contract", "error");
            return;
        }

        if (typeof window.ethereum === "undefined") {
            showToast("Please install MetaMask!", "error");
            return;
        }

        setLoading(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(targetContract, ACCESS_CONTROL_ABI, signer);

            const tx = await contract.revokeRole(roleToGrant, addressToGrant);
            showToast("Transaction submitted...", "info");
            await tx.wait();
            showToast("Role revoked successfully!", "success");
            setAddressToGrant("");
        } catch (error) {
            console.error("Error revoking role:", error);
            const message = error instanceof Error ? error.message : "Unknown error";
            showToast(`Failed: ${message}`, "error");
        } finally {
            setLoading(false);
        }
    };

    const checkRoleOnContract = async () => {
        if (!targetContract || !ethers.isAddress(targetContract)) {
            showToast("Please enter a valid contract address", "warning");
            return;
        }

        if (!addressToGrant || !ethers.isAddress(addressToGrant)) {
            showToast("Please enter a valid address to check", "warning");
            return;
        }

        if (typeof window.ethereum === "undefined") {
            showToast("Please install MetaMask!", "error");
            return;
        }

        setTargetContractLoading(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const contract = new ethers.Contract(targetContract, ACCESS_CONTROL_ABI, provider);

            const hasRole = await contract.hasRole(roleToGrant, addressToGrant);
            if (hasRole) {
                showToast(`Address has the selected role on this contract`, "success");
            } else {
                showToast(`Address does NOT have the selected role on this contract`, "warning");
            }
        } catch (error) {
            console.error("Error checking role:", error);
            showToast("Failed to check role", "error");
        } finally {
            setTargetContractLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold mb-6">Access Manager</h2>

            <div className="space-y-6">
                {/* Admin Status */}
                <div className={`p-3 rounded ${isDefaultAdmin === true ? "bg-green-50 dark:bg-green-900" : "bg-red-50 dark:bg-red-900"}`}>
                    <p className={`text-sm ${isDefaultAdmin === true ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
                        {isDefaultAdmin === true ? "✓ You have DEFAULT_ADMIN_ROLE" : "✗ You don't have DEFAULT_ADMIN_ROLE"}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Contract: {CONTRACTS.ACCESS_MANAGER.slice(0, 10)}...{CONTRACTS.ACCESS_MANAGER.slice(-8)}
                    </p>
                </div>

                {/* Check Address Roles */}
                <div className="border rounded-lg p-4">
                    <h3 className="font-semibold mb-3">Check Address Roles</h3>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={addressToCheck}
                            onChange={(e) => setAddressToCheck(e.target.value)}
                            placeholder="0x..."
                            className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                            onClick={checkAddressRoles}
                            disabled={checkLoading}
                            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
                        >
                            {checkLoading ? "Checking..." : "Check"}
                        </button>
                    </div>

                    {roleInfo && (
                        <div className="mt-4 space-y-2">
                            <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
                                <span className="text-sm">Admin Role:</span>
                                <div className="flex items-center gap-2">
                                    <span className={`text-sm font-semibold ${roleInfo.isAdmin ? "text-green-600" : "text-red-600"}`}>
                                        {roleInfo.isAdmin ? "✓ Yes" : "✗ No"}
                                    </span>
                                    {isDefaultAdmin && roleInfo.isAdmin && (
                                        <button
                                            onClick={() => handleRemoveRole("admin")}
                                            disabled={loading}
                                            className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400"
                                        >
                                            Remove
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
                                <span className="text-sm">Multisig Admin Role:</span>
                                <div className="flex items-center gap-2">
                                    <span className={`text-sm font-semibold ${roleInfo.isMultisigAdmin ? "text-green-600" : "text-red-600"}`}>
                                        {roleInfo.isMultisigAdmin ? "✓ Yes" : "✗ No"}
                                    </span>
                                    {isDefaultAdmin && roleInfo.isMultisigAdmin && (
                                        <button
                                            onClick={() => handleRemoveRole("multisigAdmin")}
                                            disabled={loading}
                                            className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400"
                                        >
                                            Remove
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
                                <span className="text-sm">EIP712 Swapper Role:</span>
                                <div className="flex items-center gap-2">
                                    <span className={`text-sm font-semibold ${roleInfo.isEIP712Swapper ? "text-green-600" : "text-red-600"}`}>
                                        {roleInfo.isEIP712Swapper ? "✓ Yes" : "✗ No"}
                                    </span>
                                    {isDefaultAdmin && roleInfo.isEIP712Swapper && (
                                        <button
                                            onClick={() => handleRemoveRole("eip712Swapper")}
                                            disabled={loading}
                                            className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400"
                                        >
                                            Remove
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Grant Role */}
                {isDefaultAdmin === true && (
                    <div className="border rounded-lg p-4">
                        <h3 className="font-semibold mb-3">Grant Role</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium mb-2">Select Role</label>
                                <select
                                    value={selectedRole}
                                    onChange={(e) => setSelectedRole(e.target.value as RoleType)}
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="admin">Admin Role</option>
                                    <option value="multisigAdmin">Multisig Admin Role</option>
                                    <option value="eip712Swapper">EIP712 Swapper Role</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Address</label>
                                <input
                                    type="text"
                                    value={newAddress}
                                    onChange={(e) => setNewAddress(e.target.value)}
                                    placeholder="0x..."
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <button
                                onClick={handleAddRole}
                                disabled={!newAddress || loading}
                                className="w-full py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
                            >
                                {loading ? "Processing..." : `Grant ${selectedRole === "admin" ? "Admin" : selectedRole === "multisigAdmin" ? "Multisig Admin" : "EIP712 Swapper"} Role`}
                            </button>
                        </div>
                    </div>
                )}

                {/* Grant Role on Any Contract (e.g., Pool Contracts) */}
                <div className="border-2 border-blue-300 dark:border-blue-700 rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20">
                    <h3 className="font-semibold mb-3 text-blue-800 dark:text-blue-200">Grant Role on Any Contract</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Use this to grant roles on pool contracts or any AccessControl contract.
                        For example, grant ADMIN_ROLE to VaultMultisig on a pool contract.
                    </p>

                    <div className="space-y-3">
                        {/* Target Contract */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Target Contract Address</label>
                            <input
                                type="text"
                                value={targetContract}
                                onChange={(e) => setTargetContract(e.target.value)}
                                placeholder="Pool contract address (0x...)"
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                            {targetContract && ethers.isAddress(targetContract) && (
                                <div className={`mt-2 p-2 rounded text-sm ${targetContractAdmin === true
                                        ? "bg-green-50 dark:bg-green-900 text-green-700 dark:text-green-300"
                                        : targetContractAdmin === false
                                            ? "bg-red-50 dark:bg-red-900 text-red-700 dark:text-red-300"
                                            : "bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                                    }`}>
                                    {targetContractLoading ? "Checking..." :
                                        targetContractAdmin === true ? "✓ You have DEFAULT_ADMIN_ROLE on this contract" :
                                            targetContractAdmin === false ? "✗ You don't have DEFAULT_ADMIN_ROLE on this contract" :
                                                "Enter contract address to check"}
                                </div>
                            )}
                        </div>

                        {/* Role to Grant */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Role to Grant/Revoke</label>
                            <select
                                value={roleToGrant}
                                onChange={(e) => setRoleToGrant(e.target.value)}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                            >
                                <option value={ROLES.ADMIN_ROLE}>ADMIN_ROLE</option>
                                <option value={ROLES.DEFAULT_ADMIN_ROLE}>DEFAULT_ADMIN_ROLE</option>
                                <option value={ROLES.MULTISIG_ADMIN_ROLE}>MULTISIG_ADMIN_ROLE</option>
                                <option value={ROLES.ALLOWED_EIP712_SWAP_ROLE}>ALLOWED_EIP712_SWAP_ROLE</option>
                            </select>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Role hash: {roleToGrant.slice(0, 10)}...{roleToGrant.slice(-8)}
                            </p>
                        </div>

                        {/* Address to Grant Role To */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Address to Grant/Revoke Role</label>
                            <input
                                type="text"
                                value={addressToGrant}
                                onChange={(e) => setAddressToGrant(e.target.value)}
                                placeholder="0xFB99A40BdaEE03f95957e8d8EbCa93Ad6e3123D8 (VaultMultisig)"
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                            <button
                                onClick={checkRoleOnContract}
                                disabled={!targetContract || !addressToGrant || targetContractLoading}
                                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                            >
                                {targetContractLoading ? "Checking..." : "Check Role"}
                            </button>
                            <button
                                onClick={handleGrantRoleOnContract}
                                disabled={!targetContract || !addressToGrant || targetContractAdmin === false || loading}
                                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                            >
                                {loading ? "Processing..." : "Grant Role"}
                            </button>
                            <button
                                onClick={handleRevokeRoleOnContract}
                                disabled={!targetContract || !addressToGrant || targetContractAdmin === false || loading}
                                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                            >
                                {loading ? "Processing..." : "Revoke Role"}
                            </button>
                        </div>

                        {/* Quick Fill for VaultMultisig */}
                        <button
                            onClick={() => setAddressToGrant(CONTRACTS.VAULT_MULTISIG)}
                            className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm"
                        >
                            Fill VaultMultisig Address
                        </button>
                    </div>
                </div>

                {/* Info */}
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <h4 className="font-semibold mb-2 text-gray-900 dark:text-white">About Roles</h4>
                    <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                        <li>• <strong>DEFAULT_ADMIN_ROLE</strong>: Can grant/revoke all roles (deployer only)</li>
                        <li>• <strong>ADMIN_ROLE</strong>: Can manage pools (add liquidity, etc.)</li>
                        <li>• <strong>MULTISIG_ADMIN_ROLE</strong>: Can manage VaultMultisig signers</li>
                        <li>• <strong>ALLOWED_EIP712_SWAP_ROLE</strong>: Can use EIP712 signed swaps</li>
                    </ul>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                        💡 <strong>Tip:</strong> To allow VaultMultisig to manage pools, grant ADMIN_ROLE to VaultMultisig ({CONTRACTS.VAULT_MULTISIG.slice(0, 10)}...{CONTRACTS.VAULT_MULTISIG.slice(-8)}) on each pool contract.
                    </p>
                </div>
            </div>
        </div>
    );
}

