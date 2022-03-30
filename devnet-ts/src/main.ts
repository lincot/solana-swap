import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  TransactionInstruction,
  Account
} from "@solana/web3.js";
import { approve, createAccount, createMint, mintTo } from "@solana/spl-token";
import { TokenSwap, TOKEN_SWAP_PROGRAM_ID } from "@solana/spl-token-swap";
import BN from "bn.js";
const BufferLayout = require("@solana/buffer-layout");

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const FEE_OWNER = new PublicKey("HfoTxFR1Tm6kGmWgYWD6J7YHVy1UwqSULUGVLXkJqaKN");

const connection = new Connection("https://api.devnet.solana.com", "recent");
const owner = new Keypair();
const payer = new Keypair();
const swapAccount = new Keypair();
let swapAuthority: PublicKey;
let mintA: PublicKey;
let mintB: PublicKey;
let mintPool: PublicKey;
let accountA: PublicKey;
let accountB: PublicKey;
let accountDestination: PublicKey;
let accountFee: PublicKey;

async function createMints() {
  mintA = await createMint(
    connection,
    payer,
    owner.publicKey,
    undefined,
    2,
    undefined,
    undefined,
    TOKEN_PROGRAM_ID,
  );
  mintB = await createMint(
    connection,
    payer,
    owner.publicKey,
    undefined,
    2,
    undefined,
    undefined,
    TOKEN_PROGRAM_ID,
  );
}

async function createPool() {
  [swapAuthority] = await PublicKey.findProgramAddress(
    [swapAccount.publicKey.toBuffer()],
    TOKEN_SWAP_PROGRAM_ID,
  );

  mintPool = await createMint(
    connection,
    payer,
    swapAuthority,
    undefined,
    2,
    undefined,
    undefined,
    TOKEN_PROGRAM_ID,
  );
  accountDestination = await createAccount(
    connection,
    payer,
    mintPool,
    owner.publicKey,
    new Keypair(),
    undefined,
    TOKEN_PROGRAM_ID,
  );
  accountFee = await createAccount(
    connection,
    payer,
    mintPool,
    FEE_OWNER,
    new Keypair(),
    undefined,
    TOKEN_PROGRAM_ID,
  );

  accountA = await createAccount(
    connection,
    payer,
    mintA,
    swapAuthority,
    new Keypair(),
    undefined,
    TOKEN_PROGRAM_ID,
  );
  await mintTo(
    connection,
    payer,
    mintA,
    accountA,
    owner,
    1_000,
    undefined,
    undefined,
    TOKEN_PROGRAM_ID,
  );

  accountB = await createAccount(
    connection,
    payer,
    mintB,
    swapAuthority,
    new Keypair(),
    undefined,
    TOKEN_PROGRAM_ID,
  );
  await mintTo(
    connection,
    payer,
    mintB,
    accountB,
    owner,
    1_000,
    undefined,
    undefined,
    TOKEN_PROGRAM_ID,
  );

  await TokenSwap.createTokenSwap(
    connection,
    new Account(payer.secretKey),
    new Account(swapAccount.secretKey),
    swapAuthority,
    accountA,
    accountB,
    mintPool,
    mintA,
    mintB,
    accountFee,
    accountDestination,
    TOKEN_SWAP_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    0,
    10000,
    5,
    10000,
    0,
    0,
    20,
    100,
    0,
    new BN(1_000_000),
  );
}

function createSwapInstruction(
  swapAccount: PublicKey,
  authority: PublicKey,
  userTransferAuthority: PublicKey,
  userSource: PublicKey,
  poolSource: PublicKey,
  poolDestination: PublicKey,
  userDestination: PublicKey,
  poolMint: PublicKey,
  feeAccount: PublicKey,
  hostFeeAccount: PublicKey | null,
  amountIn: number,
  minimumAmountOut: number,
): TransactionInstruction {
  const dataLayout = BufferLayout.struct([
    BufferLayout.u8("instruction"),
    BufferLayout.blob(8, "amountIn"),
    BufferLayout.blob(8, "minimumAmountOut"),
  ]);

  const amountInArray = new Uint8Array(8);
  new BN(amountIn).toBuffer().copy(amountInArray);
  const minimumAmountOutArray = new Uint8Array(8);
  new BN(minimumAmountOut).toBuffer().copy(minimumAmountOutArray);

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      instruction: 1,
      amountIn: amountInArray,
      minimumAmountOut: minimumAmountOutArray,
    },
    data,
  );

  const keys = [
    { pubkey: swapAccount, isSigner: false, isWritable: false },
    { pubkey: authority, isSigner: false, isWritable: false },
    { pubkey: userTransferAuthority, isSigner: false, isWritable: false },
    { pubkey: userSource, isSigner: false, isWritable: true },
    { pubkey: poolSource, isSigner: false, isWritable: true },
    { pubkey: poolDestination, isSigner: false, isWritable: true },
    { pubkey: userDestination, isSigner: false, isWritable: true },
    { pubkey: poolMint, isSigner: false, isWritable: true },
    { pubkey: feeAccount, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  if (hostFeeAccount !== null) {
    keys.push({ pubkey: hostFeeAccount, isSigner: false, isWritable: true });
  }
  return new TransactionInstruction({
    keys,
    programId: TOKEN_SWAP_PROGRAM_ID,
    data,
  });
}

async function swap() {
  const user = new Keypair();
  const userAccountA = await createAccount(
    connection,
    payer,
    mintA,
    user.publicKey,
    new Keypair(),
  );
  await mintTo(connection, payer, mintA, userAccountA, owner, 50);
  const userTransferAuthority = new Keypair();
  await approve(
    connection,
    payer,
    userAccountA,
    userTransferAuthority.publicKey,
    user,
    50,
  );
  const userAccountB = await createAccount(
    connection,
    payer,
    mintB,
    user.publicKey,
    new Keypair(),
  );
  const hostFeeAccount = await createAccount(
    connection,
    payer,
    mintPool,
    user.publicKey,
  );

  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      createSwapInstruction(
        swapAccount.publicKey,
        swapAuthority,
        userTransferAuthority.publicKey,
        userAccountA,
        accountA,
        accountB,
        userAccountB,
        mintPool,
        accountFee,
        hostFeeAccount,
        50,
        45,
      ),
    ),
    [payer, userTransferAuthority],
  );
}

async function main() {
  await connection.confirmTransaction(
    await connection.requestAirdrop(
      payer.publicKey,
      50_000_000,
    ),
  );
  console.log("airdropped");
  await createMints();
  await createPool();
  await swap();
}

main();
