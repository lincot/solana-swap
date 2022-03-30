import { Account, Connection, Keypair, PublicKey } from "@solana/web3.js";
import { approve, createAccount, createMint, mintTo } from "@solana/spl-token";
import { TOKEN_SWAP_PROGRAM_ID, TokenSwap } from "@solana/spl-token-swap";
import BN from "bn.js";

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
let tokenSwap: TokenSwap;

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

  tokenSwap = await TokenSwap.createTokenSwap(
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

  tokenSwap.swap(
    userAccountA,
    accountA,
    accountB,
    userAccountB,
    hostFeeAccount,
    new Account(userTransferAuthority.secretKey),
    50,
    45,
  );
}

async function main() {
  await connection.confirmTransaction(
    await connection.requestAirdrop(
      payer.publicKey,
      50_000_000,
    ),
  );
  await createMints();
  await createPool();
  await swap();
}

main();
