import {
  clusterApiUrl,
  Connection,
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js"
import Big from "big.js"
import { NEON_TOKEN_MINT, NEON_EVM_LOADER_ID } from "../constants"

Big.PE = 42

export class InstructionService {
  constructor(options) {
    this.network = "mainnet-beta"
    if (this._isCorrectNetworkOption(options.network)) this.network = options.network
    this.solanaWalletAddress = options.solanaWalletAddress || ""
    this.neonWalletAddress = options.neonWalletAddress || ""
    this.connection = options.customConnection || new Connection(clusterApiUrl(this.network))
    this.events = {
      onBeforeCreateInstruction: options.onBeforeCreateInstruction || function () {},
      onCreateNeonAccountInstruction: options.onCreateNeonAccountInstruction || function () {},
      onBeforeSignTransaction: options.onBeforeSignTransaction || function () {},
      onBeforeNeonSign: options.onBeforeNeonSign || function () {},
      onSuccessSign: options.onSuccessSign || function () {},
      onErrorSign: options.onErrorSign || function () {},
    }
  }

  async _getNeonAccountAddress() {
    const accountSeed = this._getNeonAccountSeed()
    const programAddress = await PublicKey.findProgramAddress(
      [new Uint8Array([1]), accountSeed],
      new PublicKey(NEON_EVM_LOADER_ID),
    )
    const neonAddress = programAddress[0]
    const neonNonce = programAddress[1]

    return { neonAddress, neonNonce }
  }

  _getBytesFromHex(hex = "") {
    // packages/web3-utils/src/utils.js
    hex = hex.toString(16)

    const isHexStrict =
      (typeof hex === "string" || typeof hex === "number") && /^(-)?0x[0-9a-f]*$/i.test(hex)

    if (!isHexStrict) {
      throw new Error('Given value "' + hex + '" is not a valid hex string.')
    }

    hex = hex.replace(/^0x/i, "")

    for (var bytes = [], c = 0; c < hex.length; c += 2) {
      bytes.push(parseInt(hex.slice(c, c + 2), 16))
    }

    return bytes
  }

  _getNeonAccountSeed() {
    return this._getBytesFromHex(this.neonWalletAddress)
  }

  async getNeonAccount() {
    const { neonAddress } = await this._getNeonAccountAddress()

    return this.connection.getAccountInfo(neonAddress)
  }

  _getSolanaWalletPubkey() {
    return new PublicKey(this.solanaWalletAddress)
  }

  _isCorrectNetworkOption(network = "") {
    if (!network.length) return false

    if (["mainnet-beta", "testnet", "devnet"].includes(network)) return true

    console.warn(
      `Your network property ${network} is wrong. Please, apply right name of network: 'devnet', 'testnet' or 'mainnet-beta'.\n Network will fallback to mainnet-beta`,
    )

    return false
  }

  _getSolanaPubkey(address = "") {
    if (!address) return this._getSolanaWalletPubkey()

    return new PublicKey(address)
  }

  _getNeonMintTokenPubkey() {
    return this._getSolanaPubkey(NEON_TOKEN_MINT)
  }

  async _createNeonAccountInstruction() {
    const { neonAddress, neonNonce } = await this._getNeonAccountAddress()
    const solanaWalletPubkey = this._getSolanaWalletPubkey()

    const keys = [
      { pubkey: solanaWalletPubkey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: neonAddress, isSigner: false, isWritable: true },
    ]

    const pattern = this._getBytesFromHex("0x18")
    const instructionData = this.mergeTypedArraysUnsafe(
      this.mergeTypedArraysUnsafe(new Uint8Array(pattern), this._getNeonAccountSeed()),
      new Uint8Array([neonNonce]),
    )

    return new TransactionInstruction({
      programId: new PublicKey(NEON_EVM_LOADER_ID),
      data: instructionData,
      keys,
    })
  }

  _mergeTypedArraysUnsafe(a, b) {
    const c = new a.constructor(a.length + b.length)
    c.set(a)
    c.set(b, a.length)

    return c
  }

  _computeWithdrawEthTransactionData(amount, splToken) {
    // transferSolana(bytes32 to, uint64 amount)
    // https://github.com/neonlabsorg/neon-evm/blob/develop/evm_loader/solidity/contracts/erc20_for_spl.sol#L161
    const approveSolanaMethodID = "0xe583d1a6"
    const solanaPubkey = this._getSolanaPubkey()
    const solanaStr = solanaPubkey.toBytes().toString("hex")
    const amountUnit = Big(amount).times(Big(10).pow(splToken.decimals))
    const amountStr = BigInt(amountUnit).toString(16).padStart(64, "0")

    return `${approveSolanaMethodID}${solanaStr}${amountStr}`
  }

  getEthereumTransactionParams(amount, token) {
    return {
      to: token.address, // Required except during contract publications.
      from: this.neonWalletAddress, // must match user's active address.
      value: "0x00", // Only required to send ether to the recipient from the initiating external account.
      data: this._computeWithdrawEthTransactionData(amount, token),
    }
  }
}
