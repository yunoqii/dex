"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { CONTRACTS, ACCESS_MANAGER_ABI, ROLES } from "../config";
import { useToast } from "../contexts/ToastContext";

const VAULT_MULTISIG_ABI = [
    "function quorum() view returns (uint256)",
    "function transfersCount() view returns (uint256)",
    "function operationsCount() view returns (uint256)",
    "function currentMultiSigSigners(uint256) view returns (address)",
    "function getTransfer(uint256 _transferId) view returns (address to, uint256 amount, uint256 approvals, bool executed)",
    "function getOperation(uint256 _operationId) view returns (address target, bytes data, string description, uint256 approvals, bool executed)",
    "function hasSignedTransfer(uint256 _transferId, address _signer) view returns (bool)",
    "function hasSignedOperation(uint256 _operationId, address _signer) view returns (bool)",
    "function initiateTransfer(address _to, uint256 _amount) external",
    "function approveTransfer(uint256 _transferId) external",
    "function executeTransfer(uint256 _transferId) external",
    "function initiateOperation(address _target, bytes _data, string _description) external",
    "function approveOperation(uint256 _operationId) external",
    "function executeOperation(uint256 _operationId) external",
    "function updateSigners(address[] _signers) external",
    "function updateQuorum(uint256 _quorum) external",
    "function getTransferCount() view returns (uint256)",
    "function getOperationCount() view returns (uint256)",
] as const;

// Available functions to call through multisig
interface FunctionDefinition {
    name: string;
    signature: string;
    targetContract: string;
    contractName: string;
    params: Array<{
        name: string;
        type: string;
        placeholder: string;
    }>;
}

const AVAILABLE_FUNCTIONS: FunctionDefinition[] = [
    {
        name: "createPool",
        signature: "createPool(address,uint256,address,uint256,address)",
        targetContract: CONTRACTS.FACTORY,
        contractName: "LiquidityPoolFactory",
        params: [
            { name: "token0", type: "address", placeholder: "0x..." },
            { name: "token0Decimals", type: "uint256", placeholder: "18" },
            { name: "token1", type: "address", placeholder: "0x..." },
            { name: "token1Decimals", type: "uint256", placeholder: "18" },
            { name: "admin", type: "address", placeholder: "0x..." },
        ],
    },
    {
        name: "setFee",
        signature: "setFee(uint256)",
        targetContract: CONTRACTS.FEE_MANAGER,
        contractName: "FeeManager",
        params: [
            { name: "_fee", type: "uint256", placeholder: "250 (basis points, e.g., 250 = 2.5%)" },
        ],
    },
    {
        name: "addLiquidityFrom",
        signature: "addLiquidityFrom(address,address,uint256)",
        targetContract: "", // Pool address - user must enter
        contractName: "LiquidityPool",
        params: [
            { name: "_from", type: "address", placeholder: "Address to transfer tokens from (your wallet)" },
            { name: "_token", type: "address", placeholder: "Token address (token0 or token1)" },
            { name: "_amount", type: "uint256", placeholder: "Amount in token's smallest unit (wei)" },
        ],
    },
    {
        name: "removeLiquidity",
        signature: "removeLiquidity(address,uint256)",
        targetContract: "", // Pool address - user must enter
        contractName: "LiquidityPool",
        params: [
            { name: "_token", type: "address", placeholder: "Token address (token0 or token1)" },
            { name: "_amount", type: "uint256", placeholder: "Amount in token's smallest unit (wei)" },
        ],
    },
];

interface Transfer {
    id: number;
    to: string;
    amount: bigint;
    approvals: bigint;
    executed: boolean;
}

interface Operation {
    id: number;
    target: string;
    data: string; // Store the data bytes
    description: string;
    approvals: bigint;
    executed: boolean;
}

export default function VaultMultisigComponent() {
    const [vaultAddress, setVaultAddress] = useState<string>(CONTRACTS.VAULT_MULTISIG || "");
    const [quorum, setQuorum] = useState<string>("");
    const [signers, setSigners] = useState<string[]>([]);
    const [isMultisigSigner, setIsMultisigSigner] = useState<boolean | null>(null);
    const [isMultisigAdmin, setIsMultisigAdmin] = useState<boolean | null>(null);
    const [userAddress, setUserAddress] = useState<string>("");
    const [transfers, setTransfers] = useState<Transfer[]>([]);
    const [operations, setOperations] = useState<Operation[]>([]);
    const [loading, setLoading] = useState(false);
    const [dataLoading, setDataLoading] = useState(false);

    // Pagination state
    const [transfersPage, setTransfersPage] = useState(1);
    const [operationsPage, setOperationsPage] = useState(1);
    const itemsPerPage = 5;

    // Operation form
    const [operationTarget, setOperationTarget] = useState("");
    const [operationData, setOperationData] = useState("");
    const [operationDescription, setOperationDescription] = useState("");
    const [selectedFunction, setSelectedFunction] = useState<string>("");
    const [functionParams, setFunctionParams] = useState<Record<string, string>>({});
    const [tokenDecimals, setTokenDecimals] = useState<Record<string, number>>({}); // For amount conversion

    // Update signers/quorum
    const [newSigners, setNewSigners] = useState("");
    const [newQuorum, setNewQuorum] = useState("");

    const { showToast } = useToast();

    const loadVaultData = useCallback(async () => {
        if (!vaultAddress || !ethers.isAddress(vaultAddress)) {
            return;
        }

        if (typeof window.ethereum === "undefined") {
            return;
        }

        setDataLoading(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const vault = new ethers.Contract(vaultAddress, VAULT_MULTISIG_ABI, provider);
            const signer = await provider.getSigner();
            const currentUserAddress = await signer.getAddress();
            setUserAddress(currentUserAddress);

            // Get quorum first
            const quorumValue = await vault.quorum();

            // Get signers by iterating through indices (public arrays in Solidity expose index-based getters)
            const signersList: string[] = [];
            try {
                // Try to get signers by calling the index-based getter
                // We'll try indices 0-10 (reasonable limit for signers)
                for (let i = 0; i < 10; i++) {
                    try {
                        const signer = await vault.currentMultiSigSigners(i);
                        if (signer && signer !== ethers.ZeroAddress) {
                            signersList.push(signer);
                        } else {
                            break; // Reached end of array
                        }
                    } catch {
                        // Index out of bounds or other error - we've reached the end
                        break;
                    }
                }
            } catch (error) {
                console.error("Error getting signers:", error);
                showToast("Failed to load signers. Contract may not be properly initialized.", "error");
            }

            // Get transfer and operation counts
            const transferCount = await vault.getTransferCount().catch(() => BigInt(0));
            const operationCount = await vault.getOperationCount().catch(() => BigInt(0));

            setQuorum(quorumValue.toString());
            setSigners(signersList);
            setIsMultisigSigner(signersList.includes(currentUserAddress));

            // Check if user is multisig admin
            if (currentUserAddress) {
                try {
                    const accessManager = new ethers.Contract(CONTRACTS.ACCESS_MANAGER, ACCESS_MANAGER_ABI, provider);
                    const hasRole = await accessManager.hasRole(ROLES.MULTISIG_ADMIN_ROLE, currentUserAddress);
                    setIsMultisigAdmin(hasRole);
                    console.log("Multisig admin check:", { userAddress: currentUserAddress, hasRole });
                } catch (error) {
                    console.error("Error checking multisig admin role:", error);
                    setIsMultisigAdmin(false);
                }
            } else {
                setIsMultisigAdmin(false);
            }

            // Load transfers
            const transferPromises: Promise<Transfer>[] = [];
            for (let i = 0; i < Number(transferCount); i++) {
                transferPromises.push(
                    vault.getTransfer(i).then((result: [string, bigint, bigint, boolean]) => ({
                        id: i,
                        to: result[0],
                        amount: result[1],
                        approvals: result[2],
                        executed: result[3],
                    }))
                );
            }
            const transferData = await Promise.all(transferPromises);
            setTransfers(transferData);

            // Load operations
            const operationPromises: Promise<Operation>[] = [];
            for (let i = 0; i < Number(operationCount); i++) {
                operationPromises.push(
                    vault.getOperation(i).then((result: [string, string, string, bigint, boolean]) => {
                        let dataHex = result[1] as string;
                        // Ensure data is hex string
                        if (typeof dataHex === "string") {
                            if (!dataHex.startsWith("0x")) {
                                dataHex = "0x" + dataHex;
                            }
                        } else if (Array.isArray(dataHex)) {
                            dataHex = ethers.hexlify(dataHex);
                        } else {
                            dataHex = ethers.hexlify(dataHex);
                        }
                        return {
                            id: i,
                            target: result[0],
                            data: dataHex,
                            description: result[2],
                            approvals: result[3],
                            executed: result[4],
                        };
                    })
                );
            }
            const operationData = await Promise.all(operationPromises);
            setOperations(operationData);
            // Reset to first page when new data loads
            setTransfersPage(1);
            setOperationsPage(1);
        } catch (error) {
            console.error("Error loading vault data:", error);
            showToast("Failed to load vault data", "error");
        } finally {
            setDataLoading(false);
        }
    }, [vaultAddress, showToast]);

    useEffect(() => {
        loadVaultData();
    }, [loadVaultData]);


    const handleApproveTransfer = async (transferId: number) => {
        if (typeof window.ethereum === "undefined") {
            showToast("Please install MetaMask!", "error");
            return;
        }

        setLoading(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const vault = new ethers.Contract(vaultAddress, VAULT_MULTISIG_ABI, signer);

            const tx = await vault.approveTransfer(transferId);
            showToast("Transaction submitted...", "info");
            await tx.wait();
            showToast("Transfer approved!", "success");
            await loadVaultData();
        } catch (error) {
            console.error("Error approving transfer:", error);
            const message = error instanceof Error ? error.message : "Unknown error";
            showToast(`Failed: ${message}`, "error");
        } finally {
            setLoading(false);
        }
    };

    const handleExecuteTransfer = async (transferId: number) => {
        if (typeof window.ethereum === "undefined") {
            showToast("Please install MetaMask!", "error");
            return;
        }

        setLoading(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const vault = new ethers.Contract(vaultAddress, VAULT_MULTISIG_ABI, signer);

            const tx = await vault.executeTransfer(transferId);
            showToast("Transaction submitted...", "info");
            await tx.wait();
            showToast("Transfer executed!", "success");
            await loadVaultData();
        } catch (error) {
            console.error("Error executing transfer:", error);
            const message = error instanceof Error ? error.message : "Unknown error";
            showToast(`Failed: ${message}`, "error");
        } finally {
            setLoading(false);
        }
    };

    const encodeFunctionCall = (funcDef: FunctionDefinition, params: Record<string, string>): string => {
        try {
            const iface = new ethers.Interface([`function ${funcDef.signature}`]);
            const paramValues = funcDef.params.map(p => {
                const value = params[p.name] || "";
                if (p.type === "address") {
                    if (!ethers.isAddress(value)) {
                        throw new Error(`Invalid address for ${p.name}`);
                    }
                    return value;
                } else if (p.type === "uint256") {
                    return BigInt(value || "0");
                } else {
                    return value;
                }
            });
            return iface.encodeFunctionData(funcDef.name, paramValues);
        } catch (error) {
            console.error("Error encoding function:", error);
            throw error;
        }
    };

    const handleFunctionSelect = (funcName: string) => {
        setSelectedFunction(funcName);
        const funcDef = AVAILABLE_FUNCTIONS.find(f => f.name === funcName);
        if (funcDef) {
            // For pool functions, don't auto-fill target (user must enter pool address)
            if (funcDef.targetContract) {
                setOperationTarget(funcDef.targetContract);
            } else {
                setOperationTarget(""); // Clear for pool functions
            }
            setFunctionParams({});
            setOperationData("");
            setOperationDescription(`Call ${funcDef.name} on ${funcDef.contractName}`);
        }
    };

    const handleParamChange = (paramName: string, value: string) => {
        setFunctionParams(prev => ({ ...prev, [paramName]: value }));

        // Auto-encode when all params are filled AND target contract is set (for pool functions)
        const funcDef = AVAILABLE_FUNCTIONS.find(f => f.name === selectedFunction);
        if (funcDef) {
            const newParams = { ...functionParams, [paramName]: value };
            const allParamsFilled = funcDef.params.every(p => newParams[p.name] && newParams[p.name].trim() !== "");

            // For pool functions, also need target contract
            const needsTarget = !funcDef.targetContract || funcDef.targetContract === "";
            const canEncode = allParamsFilled && (!needsTarget || operationTarget);

            if (canEncode) {
                try {
                    const encoded = encodeFunctionCall(funcDef, newParams);
                    setOperationData(encoded);
                } catch {
                    // Don't set data if encoding fails
                    setOperationData("");
                }
            } else {
                setOperationData("");
            }
        }
    };

    const handleInitiateOperation = async () => {
        if (!vaultAddress || !operationTarget || !operationData || !operationDescription) {
            showToast("Please fill all fields", "warning");
            return;
        }

        // Validate target contract address
        if (!ethers.isAddress(operationTarget)) {
            showToast("Invalid target contract address", "error");
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
            const vault = new ethers.Contract(vaultAddress, VAULT_MULTISIG_ABI, signer);

            // operationData should already be hex-encoded function call
            // Ensure it's a valid hex string
            let dataHex = operationData;
            if (!dataHex.startsWith("0x")) {
                dataHex = "0x" + dataHex;
            }
            const dataBytes = ethers.getBytes(dataHex);
            const tx = await vault.initiateOperation(operationTarget, dataBytes, operationDescription);
            showToast("Transaction submitted...", "info");
            await tx.wait();
            showToast("Operation initiated!", "success");
            setOperationTarget("");
            setOperationData("");
            setOperationDescription("");
            setSelectedFunction("");
            setFunctionParams({});
            await loadVaultData();
        } catch (error) {
            console.error("Error initiating operation:", error);
            const message = error instanceof Error ? error.message : "Unknown error";
            showToast(`Failed: ${message}`, "error");
        } finally {
            setLoading(false);
        }
    };

    const handleApproveOperation = async (operationId: number) => {
        if (typeof window.ethereum === "undefined") {
            showToast("Please install MetaMask!", "error");
            return;
        }

        setLoading(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const vault = new ethers.Contract(vaultAddress, VAULT_MULTISIG_ABI, signer);

            const tx = await vault.approveOperation(operationId);
            showToast("Transaction submitted...", "info");
            await tx.wait();
            showToast("Operation approved!", "success");
            await loadVaultData();
        } catch (error) {
            console.error("Error approving operation:", error);
            const message = error instanceof Error ? error.message : "Unknown error";
            showToast(`Failed: ${message}`, "error");
        } finally {
            setLoading(false);
        }
    };

    const simulateOperation = async (operationId: number) => {
        if (typeof window.ethereum === "undefined") {
            showToast("Please install MetaMask!", "error");
            return;
        }

        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const vault = new ethers.Contract(vaultAddress, VAULT_MULTISIG_ABI, provider);

            // Get operation details - use stored data if available, otherwise fetch
            let target: string;
            let data: string;

            const storedOp = operations.find(op => op.id === operationId);
            if (storedOp && storedOp.data) {
                target = storedOp.target;
                data = storedOp.data;
            } else {
                const operation = await vault.getOperation(operationId);
                target = operation[0] as string;
                const dataRaw = operation[1] as string;

                // Ensure data is hex string
                if (typeof dataRaw === "string") {
                    data = dataRaw.startsWith("0x") ? dataRaw : "0x" + dataRaw;
                } else if (Array.isArray(dataRaw)) {
                    data = ethers.hexlify(dataRaw);
                } else {
                    data = ethers.hexlify(dataRaw);
                }
            }

            console.log("Simulating operation:", { target, data: data.slice(0, 20) + "..." });

            // Try to simulate the call
            try {
                await provider.call({
                    to: target,
                    data: data,
                    from: vaultAddress, // Call from vault address
                });
                showToast("Simulation successful! Operation should execute.", "success");
            } catch (simError: unknown) {
                console.error("Simulation error:", simError);
                // Try to decode the error
                let errorMsg = "Simulation failed: ";

                // Check for revert data
                const errorObj = simError as { data?: string | { data?: string } };
                if (errorObj.data) {
                    const errorData = typeof errorObj.data === "string" ? errorObj.data : errorObj.data.data || "";
                    console.log("Error data:", errorData);

                    // Try to decode custom error
                    try {
                        const commonErrors = [
                            "error AccessControlUnauthorizedAccount(address,bytes32)",
                            "error OperationFailed(uint256)",
                            "error InsufficientBalance(uint256,uint256)",
                            "error InvalidRecipient()",
                            "error InvalidAmount()",
                            "error IdenticalTokens()",
                            "error ZeroAddress()",
                            "error PoolAlreadyExists(address,address)",
                        ];
                        const iface = new ethers.Interface(commonErrors);
                        const decoded = iface.parseError(errorData);
                        if (decoded) {
                            errorMsg += `${decoded.name}`;
                            if (decoded.args && decoded.args.length > 0) {
                                errorMsg += ` (${decoded.args.map((a: unknown) => String(a)).join(", ")})`;
                            }
                        } else {
                            errorMsg += "Unknown custom error";
                        }
                    } catch {
                        // Try to decode revert reason (Error(string))
                        try {
                            if (errorData.length >= 138) {
                                const reason = ethers.toUtf8String("0x" + errorData.slice(138));
                                if (reason && reason.length > 0) {
                                    errorMsg += reason;
                                } else {
                                    errorMsg += "Contract call reverted. Check function signature, parameters, and permissions.";
                                }
                            } else {
                                errorMsg += "Contract call reverted. Check function signature, parameters, and permissions.";
                            }
                        } catch {
                            errorMsg += "Contract call reverted. Check function signature, parameters, and permissions.";
                        }
                    }
                } else {
                    const errorWithReason = simError as { reason?: string; message?: string };
                    if (errorWithReason.reason) {
                        errorMsg += errorWithReason.reason;
                    } else if (errorWithReason.message) {
                        errorMsg += errorWithReason.message;
                    } else {
                        errorMsg += "Unknown error. Check console for details.";
                    }
                }
                showToast(errorMsg, "error");
            }
        } catch (error) {
            console.error("Error simulating operation:", error);
            const msg = error instanceof Error ? error.message : "Unknown error";
            showToast(`Failed to simulate: ${msg}`, "error");
        }
    };

    const handleExecuteOperation = async (operationId: number) => {
        if (typeof window.ethereum === "undefined") {
            showToast("Please install MetaMask!", "error");
            return;
        }

        setLoading(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const vault = new ethers.Contract(vaultAddress, VAULT_MULTISIG_ABI, signer);

            // First, try to simulate to get better error message
            try {
                // Use stored data if available, otherwise fetch
                let target: string;
                let data: string;

                const storedOp = operations.find(op => op.id === operationId);
                if (storedOp && storedOp.data) {
                    target = storedOp.target;
                    data = storedOp.data;
                } else {
                    const operation = await vault.getOperation(operationId);
                    target = operation[0] as string;
                    let dataRaw = operation[1] as string;

                    // Ensure data is hex string
                    if (typeof dataRaw === "string") {
                        data = dataRaw.startsWith("0x") ? dataRaw : "0x" + dataRaw;
                    } else if (Array.isArray(dataRaw)) {
                        data = ethers.hexlify(dataRaw);
                    } else {
                        data = ethers.hexlify(dataRaw);
                    }
                }

                // Simulate the call
                await provider.call({
                    to: target,
                    data: data,
                    from: vaultAddress,
                });
            } catch (simError: unknown) {
                // If simulation fails, show detailed error
                console.error("Pre-execution simulation failed:", simError);
                let errorMsg = "Operation will fail: ";

                const errorData = (simError as { data?: string; error?: { data?: string; error?: { data?: string } } }).data ||
                    ((simError as { error?: { data?: string; error?: { data?: string } } }).error?.data) ||
                    ((simError as { error?: { error?: { data?: string } } }).error?.error?.data);
                if (errorData) {
                    try {
                        const commonErrors = [
                            "error AccessControlUnauthorizedAccount(address,bytes32)",
                            "error OperationFailed(uint256)",
                            "error InsufficientBalance(uint256,uint256)",
                            "error InvalidRecipient()",
                            "error InvalidAmount()",
                            "error IdenticalTokens()",
                            "error ZeroAddress()",
                            "error PoolAlreadyExists(address,address)",
                        ];
                        const iface = new ethers.Interface(commonErrors);
                        const decoded = iface.parseError(errorData);
                        if (decoded) {
                            errorMsg += `${decoded.name}`;
                            if (decoded.name === "AccessControlUnauthorizedAccount") {
                                errorMsg += ` - VaultMultisig needs the required role on the target contract`;
                            } else {
                                errorMsg += ` - Check parameters`;
                            }
                        } else {
                            errorMsg += "Contract call will revert. Check function signature and parameters.";
                        }
                    } catch {
                        errorMsg += "Contract call will revert. Verify the target contract and function.";
                    }
                } else {
                    const errorWithReason = simError as { reason?: string; message?: string };
                    if (errorWithReason.reason) {
                        errorMsg += errorWithReason.reason;
                    } else if (errorWithReason.message) {
                        errorMsg += errorWithReason.message;
                    } else {
                        errorMsg += "Unknown error. Check console for details.";
                    }
                }
                showToast(errorMsg, "error");
                setLoading(false);
                return;
            }

            // If simulation passes, execute
            const tx = await vault.executeOperation(operationId);
            showToast("Transaction submitted...", "info");
            await tx.wait();
            showToast("Operation executed!", "success");
            await loadVaultData();
        } catch (error: unknown) {
            console.error("Error executing operation:", error);
            let message = "Unknown error";

            const err = error as { reason?: string; data?: string; message?: string };
            // Try to extract more detailed error
            if (err.reason) {
                message = err.reason;
            } else if (err.data) {
                try {
                    const iface = new ethers.Interface(["error OperationFailed(uint256)"]);
                    const decoded = iface.parseError(err.data);
                    if (decoded) {
                        message = `OperationFailed: The target contract call reverted. Check function parameters and contract permissions.`;
                    }
                } catch {
                    message = err.message || "Operation execution failed";
                }
            } else if (err.message) {
                message = err.message;
            }

            showToast(`Failed: ${message}`, "error");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateSigners = async () => {
        if (!newSigners) {
            showToast("Please enter signer addresses", "warning");
            return;
        }

        if (isMultisigAdmin === false) {
            showToast("You must have MULTISIG_ADMIN_ROLE", "error");
            return;
        }

        if (typeof window.ethereum === "undefined") {
            showToast("Please install MetaMask!", "error");
            return;
        }

        setLoading(true);
        try {
            // Handle both comma-separated and newline-separated addresses
            const addresses = newSigners
                .split(/[,\n]/)
                .map((s) => s.trim())
                .filter((s) => s.length > 0);

            // Validate all addresses
            const invalidAddresses: string[] = [];
            const validAddresses: string[] = [];
            const seenAddresses = new Set<string>();

            for (const addr of addresses) {
                const normalizedAddr = addr.toLowerCase();
                if (!ethers.isAddress(addr)) {
                    invalidAddresses.push(addr);
                } else if (seenAddresses.has(normalizedAddr)) {
                    invalidAddresses.push(`${addr} (duplicate)`);
                } else {
                    seenAddresses.add(normalizedAddr);
                    validAddresses.push(addr);
                }
            }

            if (invalidAddresses.length > 0) {
                showToast(
                    `Invalid addresses: ${invalidAddresses.slice(0, 3).join(", ")}${invalidAddresses.length > 3 ? "..." : ""}`,
                    "error"
                );
                setLoading(false);
                return;
            }

            if (validAddresses.length === 0) {
                showToast("No valid addresses provided", "error");
                setLoading(false);
                return;
            }

            // Check quorum requirement
            const currentQuorum = Number(quorum) || 0;
            if (validAddresses.length < currentQuorum) {
                showToast(
                    `Number of signers (${validAddresses.length}) must be >= quorum (${currentQuorum})`,
                    "error"
                );
                setLoading(false);
                return;
            }

            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const vault = new ethers.Contract(vaultAddress, VAULT_MULTISIG_ABI, signer);

            const tx = await vault.updateSigners(validAddresses);
            showToast("Transaction submitted...", "info");
            await tx.wait();
            showToast("Signers updated!", "success");
            setNewSigners("");
            await loadVaultData();
        } catch (error) {
            console.error("Error updating signers:", error);
            let message = "Unknown error";
            if (error instanceof Error) {
                message = error.message;
                // Try to extract more specific error
                if (message.includes("SignersArrayCannotBeEmpty")) {
                    message = "Signers array cannot be empty";
                } else if (message.includes("QuorumGreaterThanSigners")) {
                    message = "Quorum cannot be greater than number of signers";
                }
            }
            showToast(`Failed: ${message}`, "error");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateQuorum = async () => {
        if (!newQuorum || isNaN(parseInt(newQuorum))) {
            showToast("Please enter a valid quorum", "warning");
            return;
        }

        if (isMultisigAdmin === false) {
            showToast("You must have MULTISIG_ADMIN_ROLE", "error");
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
            const vault = new ethers.Contract(vaultAddress, VAULT_MULTISIG_ABI, signer);

            const tx = await vault.updateQuorum(newQuorum);
            showToast("Transaction submitted...", "info");
            await tx.wait();
            showToast("Quorum updated!", "success");
            setNewQuorum("");
            await loadVaultData();
        } catch (error) {
            console.error("Error updating quorum:", error);
            const message = error instanceof Error ? error.message : "Unknown error";
            showToast(`Failed: ${message}`, "error");
        } finally {
            setLoading(false);
        }
    };

    if (!vaultAddress) {
        return (
            <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                <h2 className="text-2xl font-bold mb-6">Vault Multisig</h2>
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900 rounded">
                    <p className="text-yellow-700 dark:text-yellow-300">
                        VaultMultisig contract address not configured. Please deploy it first and update the config.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold mb-6">Vault Multisig</h2>

            <div className="space-y-6">
                {/* Vault Address Input */}
                <div>
                    <label className="block text-sm font-medium mb-2">Vault Address</label>
                    <input
                        type="text"
                        value={vaultAddress}
                        onChange={(e) => setVaultAddress(e.target.value)}
                        placeholder="0x..."
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                        onClick={loadVaultData}
                        disabled={dataLoading}
                        className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400"
                    >
                        {dataLoading ? "Loading..." : "Load Data"}
                    </button>
                </div>

                {/* Status */}
                {quorum && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-blue-50 dark:bg-blue-900 rounded-lg p-4">
                            <p className="text-sm text-blue-700 dark:text-blue-300">Quorum</p>
                            <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{quorum}</p>
                        </div>
                        <div className="bg-green-50 dark:bg-green-900 rounded-lg p-4">
                            <p className="text-sm text-green-700 dark:text-green-300">Signers</p>
                            <p className="text-2xl font-bold text-green-900 dark:text-green-100">{signers.length}</p>
                        </div>
                        <div className={`rounded-lg p-4 ${isMultisigSigner ? "bg-green-50 dark:bg-green-900" : "bg-red-50 dark:bg-red-900"}`}>
                            <p className="text-sm">Your Status</p>
                            <p className="text-lg font-bold">{isMultisigSigner ? "✓ Signer" : "✗ Not Signer"}</p>
                        </div>
                    </div>
                )}

                {/* Signers List */}
                {signers.length > 0 && (
                    <div className="border rounded-lg p-4">
                        <h3 className="font-semibold mb-2">Signers</h3>
                        <div className="space-y-1">
                            {signers.map((signer, idx) => (
                                <p key={idx} className="text-sm text-gray-600 dark:text-gray-400">
                                    {idx + 1}. {signer}
                                </p>
                            ))}
                        </div>
                    </div>
                )}


                {/* Transfers List */}
                {transfers.length > 0 && (() => {
                    // Sort by ID descending (latest first) and paginate
                    const sortedTransfers = [...transfers].sort((a, b) => b.id - a.id);
                    const totalPages = Math.ceil(sortedTransfers.length / itemsPerPage);
                    const startIndex = (transfersPage - 1) * itemsPerPage;
                    const endIndex = startIndex + itemsPerPage;
                    const paginatedTransfers = sortedTransfers.slice(startIndex, endIndex);

                    return (
                        <div className="border rounded-lg p-4">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="font-semibold">Transfers ({transfers.length})</h3>
                                {totalPages > 1 && (
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setTransfersPage(p => Math.max(1, p - 1))}
                                            disabled={transfersPage === 1}
                                            className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed text-sm"
                                        >
                                            Previous
                                        </button>
                                        <span className="text-sm text-gray-600 dark:text-gray-400">
                                            Page {transfersPage} of {totalPages}
                                        </span>
                                        <button
                                            onClick={() => setTransfersPage(p => Math.min(totalPages, p + 1))}
                                            disabled={transfersPage === totalPages}
                                            className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed text-sm"
                                        >
                                            Next
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-2">
                                {paginatedTransfers.map((transfer) => (
                                    <div key={transfer.id} className="bg-gray-50 dark:bg-gray-700 rounded p-3">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-sm">ID: {transfer.id}</p>
                                                <p className="text-sm">To: {transfer.to.slice(0, 10)}...{transfer.to.slice(-8)}</p>
                                                <p className="text-sm">Amount: {ethers.formatEther(transfer.amount)} ETH</p>
                                                <p className="text-sm">Approvals: {transfer.approvals.toString()} / {quorum}</p>
                                                <p className={`text-sm font-semibold ${transfer.executed ? "text-green-600" : "text-yellow-600"}`}>
                                                    {transfer.executed ? "✓ Executed" : "Pending"}
                                                </p>
                                            </div>
                                            {isMultisigSigner && !transfer.executed && (
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleApproveTransfer(transfer.id)}
                                                        disabled={loading}
                                                        className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:bg-gray-400"
                                                    >
                                                        Approve
                                                    </button>
                                                    {Number(transfer.approvals) >= Number(quorum) && (
                                                        <button
                                                            onClick={() => handleExecuteTransfer(transfer.id)}
                                                            disabled={loading}
                                                            className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:bg-gray-400"
                                                        >
                                                            Execute
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })()}

                {/* Initiate Operation */}
                {isMultisigSigner && (
                    <div className="border rounded-lg p-4">
                        <h3 className="font-semibold mb-3">Initiate Operation</h3>
                        <div className="space-y-3">
                            {/* Function Selector */}
                            <div>
                                <label className="block text-sm font-medium mb-2">Select Function</label>
                                <select
                                    value={selectedFunction}
                                    onChange={(e) => handleFunctionSelect(e.target.value)}
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">-- Choose a function --</option>
                                    {AVAILABLE_FUNCTIONS.map((func) => (
                                        <option key={func.name} value={func.name}>
                                            {func.contractName}.{func.name}
                                        </option>
                                    ))}
                                    <option value="custom">Custom (Manual Hex)</option>
                                </select>
                            </div>

                            {/* Dynamic Parameter Inputs */}
                            {selectedFunction && selectedFunction !== "custom" && (
                                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 space-y-2">
                                    <p className="text-sm font-medium mb-2">Parameters:</p>
                                    {AVAILABLE_FUNCTIONS.find(f => f.name === selectedFunction)?.params.map((param) => {
                                        const isAmountParam = param.name === "_amount" &&
                                            (selectedFunction === "addLiquidityFrom" || selectedFunction === "removeLiquidity");
                                        return (
                                            <div key={param.name}>
                                                <label className="block text-xs font-medium mb-1">
                                                    {param.name} ({param.type})
                                                    {isAmountParam && (
                                                        <span className="text-yellow-600 ml-2">
                                                            (Enter in token&apos;s smallest unit, e.g., 1000000000000000000 for 1 token)
                                                        </span>
                                                    )}
                                                </label>
                                                {isAmountParam ? (
                                                    <div className="space-y-2">
                                                        <input
                                                            type="number"
                                                            step="any"
                                                            value={functionParams[param.name] || ""}
                                                            onChange={(e) => {
                                                                const value = e.target.value;
                                                                // If user enters decimal, try to convert
                                                                if (value && value.includes(".")) {
                                                                    const tokenAddr = functionParams["_token"];
                                                                    if (tokenAddr && ethers.isAddress(tokenAddr)) {
                                                                        // Try to get decimals and convert
                                                                        const decimals = tokenDecimals[tokenAddr.toLowerCase()] || 18;
                                                                        try {
                                                                            const weiValue = ethers.parseUnits(value, decimals);
                                                                            handleParamChange(param.name, weiValue.toString());
                                                                            return;
                                                                        } catch {
                                                                            // If conversion fails, just store the value
                                                                        }
                                                                    }
                                                                }
                                                                handleParamChange(param.name, value);
                                                            }}
                                                            placeholder="Amount (e.g., 1.5 for 1.5 tokens)"
                                                            className="w-full px-3 py-2 border rounded text-sm"
                                                        />
                                                        {functionParams["_token"] && ethers.isAddress(functionParams["_token"]) && (
                                                            <button
                                                                type="button"
                                                                onClick={async () => {
                                                                    const tokenAddr = functionParams["_token"];
                                                                    if (typeof window.ethereum !== "undefined") {
                                                                        try {
                                                                            const provider = new ethers.BrowserProvider(window.ethereum);
                                                                            const tokenContract = new ethers.Contract(
                                                                                tokenAddr,
                                                                                ["function decimals() view returns (uint8)"],
                                                                                provider
                                                                            );
                                                                            const decimals = await tokenContract.decimals();
                                                                            setTokenDecimals(prev => ({
                                                                                ...prev,
                                                                                [tokenAddr.toLowerCase()]: decimals
                                                                            }));
                                                                        } catch {
                                                                            // Default to 18
                                                                            setTokenDecimals(prev => ({
                                                                                ...prev,
                                                                                [tokenAddr.toLowerCase()]: 18
                                                                            }));
                                                                        }
                                                                    }
                                                                }}
                                                                className="text-xs text-blue-600 hover:text-blue-800"
                                                            >
                                                                Auto-detect decimals
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <input
                                                        type="text"
                                                        value={functionParams[param.name] || ""}
                                                        onChange={(e) => handleParamChange(param.name, e.target.value)}
                                                        placeholder={param.placeholder}
                                                        className="w-full px-3 py-2 border rounded text-sm"
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Target Contract (auto-filled for selected functions, editable for custom and pool functions) */}
                            <div>
                                <label className="block text-sm font-medium mb-2">Target Contract</label>
                                <input
                                    type="text"
                                    value={operationTarget}
                                    onChange={(e) => setOperationTarget(e.target.value)}
                                    placeholder={
                                        selectedFunction === "addLiquidity" || selectedFunction === "removeLiquidity"
                                            ? "Pool address (0x...)"
                                            : "0x..."
                                    }
                                    className="w-full px-4 py-2 border rounded-lg"
                                    disabled={
                                        !!(selectedFunction &&
                                            selectedFunction !== "custom" &&
                                            selectedFunction !== "addLiquidity" &&
                                            selectedFunction !== "removeLiquidity")
                                    }
                                />
                                {(selectedFunction === "addLiquidity" || selectedFunction === "removeLiquidity") && (
                                    <p className="text-xs text-yellow-600 mt-1">
                                        ⚠️ Enter the pool address. VaultMultisig needs ADMIN_ROLE on the pool.
                                    </p>
                                )}
                            </div>

                            {/* Function Data (auto-encoded for selected functions, manual for custom) */}
                            <div>
                                <label className="block text-sm font-medium mb-2">Function Data (Hex)</label>
                                <input
                                    type="text"
                                    value={operationData}
                                    onChange={(e) => setOperationData(e.target.value)}
                                    placeholder="0x..."
                                    className="w-full px-4 py-2 border rounded-lg font-mono text-sm"
                                    disabled={!!(selectedFunction && selectedFunction !== "custom")}
                                />
                                {selectedFunction && selectedFunction !== "custom" && operationData && (
                                    <p className="text-xs text-green-600 mt-1">✓ Encoded automatically</p>
                                )}
                                {selectedFunction === "setFee" && (
                                    <p className="text-xs text-yellow-600 mt-1">
                                        ⚠️ Note: VaultMultisig needs DEFAULT_ADMIN_ROLE on FeeManager
                                    </p>
                                )}
                                {(selectedFunction === "addAdmin" || selectedFunction === "removeAdmin" ||
                                    selectedFunction === "addMultisigAdmin" || selectedFunction === "removeMultisigAdmin" ||
                                    selectedFunction === "addEIP712Swapper" || selectedFunction === "removeEIP712Swapper") && (
                                        <p className="text-xs text-yellow-600 mt-1">
                                            ⚠️ Note: VaultMultisig needs DEFAULT_ADMIN_ROLE on AccessManager
                                        </p>
                                    )}
                                {selectedFunction === "setFee" && (
                                    <p className="text-xs text-yellow-600 mt-1">
                                        ⚠️ Note: VaultMultisig needs ADMIN_ROLE on FeeManager. Fee is in basis points (e.g., 250 = 2.5%, 100 = 1%).
                                    </p>
                                )}
                                {selectedFunction === "addLiquidityFrom" && (
                                    <div className="text-xs text-yellow-600 mt-1 space-y-1">
                                        <p>⚠️ <strong>Important:</strong></p>
                                        <p>1. VaultMultisig needs ADMIN_ROLE on the pool</p>
                                        <p>2. <strong>_from</strong> should be your wallet address (the token holder)</p>
                                        <p>3. You must <strong>approve the pool</strong> to spend your tokens before executing</p>
                                        <p>4. Amount should be in token&apos;s smallest unit (e.g., 1e18 for 1 token with 18 decimals)</p>
                                    </div>
                                )}
                                {selectedFunction === "removeLiquidity" && (
                                    <p className="text-xs text-yellow-600 mt-1">
                                        ⚠️ Note: VaultMultisig needs ADMIN_ROLE on the pool. Amount should be in token&apos;s smallest unit (e.g., 1e18 for 1 token with 18 decimals).
                                    </p>
                                )}
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-medium mb-2">Description</label>
                                <input
                                    type="text"
                                    value={operationDescription}
                                    onChange={(e) => setOperationDescription(e.target.value)}
                                    placeholder="Human-readable description"
                                    className="w-full px-4 py-2 border rounded-lg"
                                />
                            </div>

                            <button
                                onClick={handleInitiateOperation}
                                disabled={loading || !operationTarget || !operationData || !operationDescription}
                                className="w-full py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                            >
                                {loading ? "Processing..." : "Initiate Operation"}
                            </button>
                        </div>
                    </div>
                )}

                {/* Operations List */}
                {operations.length > 0 && (() => {
                    // Sort by ID descending (latest first) and paginate
                    const sortedOperations = [...operations].sort((a, b) => b.id - a.id);
                    const totalPages = Math.ceil(sortedOperations.length / itemsPerPage);
                    const startIndex = (operationsPage - 1) * itemsPerPage;
                    const endIndex = startIndex + itemsPerPage;
                    const paginatedOperations = sortedOperations.slice(startIndex, endIndex);

                    return (
                        <div className="border rounded-lg p-4">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="font-semibold">Operations ({operations.length})</h3>
                                {totalPages > 1 && (
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setOperationsPage(p => Math.max(1, p - 1))}
                                            disabled={operationsPage === 1}
                                            className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed text-sm"
                                        >
                                            Previous
                                        </button>
                                        <span className="text-sm text-gray-600 dark:text-gray-400">
                                            Page {operationsPage} of {totalPages}
                                        </span>
                                        <button
                                            onClick={() => setOperationsPage(p => Math.min(totalPages, p + 1))}
                                            disabled={operationsPage === totalPages}
                                            className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed text-sm"
                                        >
                                            Next
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-2">
                                {paginatedOperations.map((operation) => (
                                    <div key={operation.id} className="bg-gray-50 dark:bg-gray-700 rounded p-3">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-sm">ID: {operation.id}</p>
                                                <p className="text-sm">Target: {operation.target.slice(0, 10)}...{operation.target.slice(-8)}</p>
                                                <p className="text-sm">Description: {operation.description}</p>
                                                <p className="text-sm">Approvals: {operation.approvals.toString()} / {quorum}</p>
                                                <p className="text-xs text-gray-500 font-mono break-all">
                                                    Data: {operation.data.slice(0, 20)}...{operation.data.slice(-10)}
                                                </p>
                                                <p className={`text-sm font-semibold ${operation.executed ? "text-green-600" : "text-yellow-600"}`}>
                                                    {operation.executed ? "✓ Executed" : "Pending"}
                                                </p>
                                            </div>
                                            {isMultisigSigner && !operation.executed && (
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleApproveOperation(operation.id)}
                                                        disabled={loading}
                                                        className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:bg-gray-400"
                                                    >
                                                        Approve
                                                    </button>
                                                    {Number(operation.approvals) >= Number(quorum) && (
                                                        <>
                                                            <button
                                                                onClick={() => simulateOperation(operation.id)}
                                                                disabled={loading}
                                                                className="px-3 py-1 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600 disabled:bg-gray-400"
                                                                title="Test the operation before executing"
                                                            >
                                                                Simulate
                                                            </button>
                                                            <button
                                                                onClick={() => handleExecuteOperation(operation.id)}
                                                                disabled={loading}
                                                                className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:bg-gray-400"
                                                            >
                                                                Execute
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })()}

                {/* Admin Controls */}
                {isMultisigAdmin === null && (
                    <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-700">
                        <p className="text-sm text-gray-600 dark:text-gray-400">Checking admin status...</p>
                    </div>
                )}
                {isMultisigAdmin === false && (
                    <div className="border rounded-lg p-4 bg-yellow-50 dark:bg-yellow-900/20">
                        <p className="text-sm text-yellow-700 dark:text-yellow-300">
                            ⚠️ You need MULTISIG_ADMIN_ROLE to access admin controls. Current address: {userAddress || "Not connected"}
                        </p>
                    </div>
                )}
                {isMultisigAdmin === true && (
                    <div className="border-2 border-orange-300 dark:border-orange-700 rounded-lg p-4 bg-orange-50 dark:bg-orange-900/20">
                        <h3 className="font-semibold mb-4 text-orange-800 dark:text-orange-200">Admin Controls</h3>
                        <div className="space-y-4">
                            {/* Update Signers */}
                            <div>
                                <label className="block text-sm font-medium mb-2 text-orange-700 dark:text-orange-300">
                                    Update Signers
                                </label>
                                <textarea
                                    value={newSigners}
                                    onChange={(e) => setNewSigners(e.target.value)}
                                    placeholder="Enter signer addresses, one per line or comma-separated"
                                    className="w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-800"
                                    rows={3}
                                />
                                <button
                                    onClick={handleUpdateSigners}
                                    disabled={loading || !newSigners.trim()}
                                    className="mt-2 w-full py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:bg-gray-400 font-semibold"
                                >
                                    {loading ? "Processing..." : "Update Signers"}
                                </button>
                            </div>

                            {/* Update Quorum */}
                            <div>
                                <label className="block text-sm font-medium mb-2 text-orange-700 dark:text-orange-300">
                                    Update Quorum
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        value={newQuorum}
                                        onChange={(e) => setNewQuorum(e.target.value)}
                                        placeholder="New quorum (minimum approvals)"
                                        className="flex-1 px-4 py-2 border rounded-lg bg-white dark:bg-gray-800"
                                        min="1"
                                    />
                                    <button
                                        onClick={handleUpdateQuorum}
                                        disabled={loading || !newQuorum || isNaN(parseInt(newQuorum))}
                                        className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:bg-gray-400 font-semibold whitespace-nowrap"
                                    >
                                        {loading ? "Processing..." : "Update"}
                                    </button>
                                </div>
                                {quorum && (
                                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                        Current quorum: {quorum.toString()}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

