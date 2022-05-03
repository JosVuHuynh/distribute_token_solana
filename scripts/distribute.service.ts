import { BN } from '@project-serum/anchor';
import * as borsh from '@project-serum/borsh';
import { ACCOUNT_SIZE, createAccount, createInitializeAccountInstruction, createMint, createMintToCheckedInstruction, getAccount,getMinimumBalanceForRentExemptAccount,getMint,getOrCreateAssociatedTokenAccount,mintTo,mintToChecked,TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { TokenPocketWalletName } from '@solana/wallet-adapter-wallets';
import { AccountMeta, Transaction, TransactionInstruction, PublicKey, Connection, Keypair, LAMPORTS_PER_SOL, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
import { BorshService } from './borsh.service';
import { HashService } from './hash.service';
import MerkleTree from 'merkletreejs';
import keccak256 from 'keccak256'
import { keccak_256 } from "js-sha3";
 


//let connection = new Connection('https://api.devnet.solana.com', 'confirmed')
let connection = new Connection('http://127.0.0.1:8899', 'confirmed')
let programId = new PublicKey('GLfs2uXqmGoun5X4eTVxS7TcRPqw5dnsWvtEPzJzAq4v')


export class CreateDistributor {
    bump: number
    root: Buffer
    totalClaimed: BN
}

export class Claim {
    index: BN
    amount: BN
    proof: Buffer[]
}

export class CreateDistributorRequest {
    bump: number
    root: Buffer
    totalClaimed: BN
}

export class ClaimRequest {
    bump: number
    index: BN
    amount: BN
    proof: Buffer[]
}

export class CreateAccountDistributor {
    mint: PublicKey
    payer: Keypair
    tokenAccountSender: PublicKey
    distributorAddress: PublicKey
    bump: number
}

const DISTRIBUTE_PROGRAM_LAYOUTS = {
    CREATE_DISTRIBUTOR: <borsh.Layout<CreateDistributor>> borsh.struct([
        borsh.u8('bump'),
        borsh.array<number>(borsh.u8(),32,'root'),
        borsh.i64('totalClaimed'),
    ]),

    CLAIM: <borsh.Layout<Claim>> borsh.struct([
        borsh.u8('bump'),
        borsh.u64('index'),
        borsh.u64('amount'),
        borsh.vec(borsh.array(borsh.u8(),32), 'proof')
    ])
}


export async function getAirdrop(key: PublicKey) {
    const sig = await connection.requestAirdrop(
        key,
        LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(sig);
    console.log('using account',sig);
}

export async function createDistributor(
    root: Buffer,
    totalClaimed: BN,
    distributeProgramId: PublicKey,
    _mint: PublicKey,
    _payer: Keypair,
    _distributorAddress: PublicKey,
    _bump: number
): Promise<void> {
    const payer = _payer
    const mintPubkey = _mint
    const distributorAddress = _distributorAddress
    const transaction: Transaction = new Transaction();
    const request: CreateDistributorRequest = {
        bump: _bump,
        root: root,
        totalClaimed: totalClaimed
    }

    const data: Buffer = BorshService.anchorSerialize(
        'create_distributor',
        DISTRIBUTE_PROGRAM_LAYOUTS.CREATE_DISTRIBUTOR,
        request,
        4000
    )
    console.log('distributorAddress is ',distributorAddress.toBase58());
    console.log('_bum is ', _bump);

    console.log("mintPubkey is", mintPubkey.toBase58())
    console.log("payer is", payer.publicKey.toBase58())


    const keys: AccountMeta[] = [
        <AccountMeta>{pubkey: payer.publicKey, isSigner: true, isWritable: true },
        <AccountMeta>{pubkey: distributorAddress, isSigner: false, isWritable: true },
        <AccountMeta>{pubkey: mintPubkey, isSigner: false, isWritable: false },
        <AccountMeta>{pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ]

    const instruction = new TransactionInstruction({
        keys,
        data,
        programId: distributeProgramId
    })

    const txSignature = await sendAndConfirmTransaction(
        connection,
        new Transaction().add(instruction),
        [payer],
    );
    console.log(txSignature)
}

export async function claim(
    index: BN,
    amount: BN,
    proof: Buffer[],
    _mintPubkey: PublicKey,
    _tokenAccountSender: PublicKey,
    _distributeAddress: PublicKey

):Promise<void> {
    const tokenAccountSender = _tokenAccountSender
    const distributorAddress = _distributeAddress
    let mintPubkey = _mintPubkey

    const [statusAddress, _bump] = await findStatusAddress(distributorAddress, programId);
    
    const request: ClaimRequest = {
        bump: _bump,
        index: index,
        amount: amount,
        proof: proof
    }

    const data : Buffer = BorshService.anchorSerialize(
        'claim',
        DISTRIBUTE_PROGRAM_LAYOUTS.CLAIM,
        request,
        4000,
    )

    const tokenAccountRecipent = Keypair.generate();
    
    await getAirdrop(claimer.publicKey)

    let tokenAccountRecipentPubkey = await createAccount(
      connection, // connection
      claimer, // fee payer
      mintPubkey, // mint
      claimer.publicKey, // owner
      tokenAccountRecipent // token account (if you don't pass it, it will use ATA for you)
    );
  

    const keys: AccountMeta[] = [
        <AccountMeta>{pubkey: distributorAddress, isSigner: false, isWritable: true},
        <AccountMeta>{pubkey: tokenAccountSender, isSigner: false, isWritable: true},
        <AccountMeta>{pubkey: tokenAccountRecipentPubkey, isSigner: false, isWritable: true},
        <AccountMeta>{pubkey: claimer.publicKey, isSigner: true, isWritable:true},
        <AccountMeta>{pubkey: statusAddress, isSigner: false, isWritable: true},
        <AccountMeta>{pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false},
        <AccountMeta>{pubkey: SystemProgram.programId, isSigner: false, isWritable: false},
    ]

    const instruction = new TransactionInstruction ({
        keys,
        data,
        programId: programId
    })

    const txSignature = await sendAndConfirmTransaction(
        connection,
        new Transaction().add(instruction),
        [claimer],
    )
    console.log(txSignature);
}

export async function findDistributorAddress(
    distributorAddress: PublicKey,
    distributeProgramId: PublicKey,
  ): Promise<[PublicKey, number]> {
    const prefix: Buffer = Buffer.from("Distributor")
    return PublicKey.findProgramAddress([prefix, distributorAddress.toBuffer()], distributeProgramId)
}

export async function findStatusAddress(
    distributorAddress: PublicKey,
    distributeProgramId: PublicKey,
  ): Promise<[PublicKey, number]> {
    const prefix: Buffer = Buffer.from("Status")
    console.log(prefix);
    return PublicKey.findProgramAddress([prefix, distributorAddress.toBuffer()], distributeProgramId)
}


export async function createAccountDistributor():Promise<CreateAccountDistributor>{
    let payer = Keypair.generate();
    const tokenAccount = Keypair.generate();

    await getAirdrop(payer.publicKey)
    let mintPubkey = await createMint(
        connection, // conneciton
        payer, // fee payer
        payer.publicKey, // mint authority
        payer.publicKey, // freeze authority (you can use `null` to disable it. when you disable it, you can't turn it on again)
        8 // decimals
      );
    const tokenAccountEx = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mintPubkey,
    payer.publicKey
    )
    
    const [distributorAddress, _bump] = await findDistributorAddress(payer.publicKey, programId);
    let tx = new Transaction().add(
    // create token account
    SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: tokenAccount.publicKey,
        space: ACCOUNT_SIZE,
        lamports: await getMinimumBalanceForRentExemptAccount(connection),
        programId: TOKEN_PROGRAM_ID,
    }),
    // init mint account
    createInitializeAccountInstruction(
        tokenAccount.publicKey, // token account
        mintPubkey, // mint
        distributorAddress  //owner of token account
        //payer.publicKey
    )
    );

    console.log(`txhash: ${await connection.sendTransaction(tx, [payer, tokenAccount])}`);

    let createAccountDistributor :CreateAccountDistributor = {
    mint: mintPubkey,
    payer: payer,
    tokenAccountSender: tokenAccount.publicKey,
    distributorAddress: distributorAddress,
    bump: _bump
    };
   
    return createAccountDistributor
}

const kpOne = Keypair.generate();
const kpTwo = Keypair.generate();
const kpThree = Keypair.generate();
const claimer = Keypair.generate();

const buf = Buffer.concat([
    new BN(1).toArrayLike(Buffer, "le", 8),
    claimer.publicKey.toBuffer(),
    new BN(0).toArrayLike(Buffer, "le", 8),
  ]);

const leaves = [
    keccak_256(
        Buffer.concat([
            new BN(1).toArrayLike(Buffer, "le", 8),
            claimer.publicKey.toBuffer(),
            new BN(0).toArrayLike(Buffer, "le", 8),
        ])
    ),
    keccak_256(
        Buffer.concat([
            new BN(1).toArrayLike(Buffer, "le", 8),
            kpOne.publicKey.toBuffer(),
            new BN(0).toArrayLike(Buffer, "le", 8),
        ])
    )
]

const tree = new MerkleTree(leaves, keccak256)
const root = tree.getRoot()
const leaf = Buffer.from(keccak_256(buf), "hex")
const proof = tree.getProof(leaf)
let buffer: Buffer[] = [];
proof.forEach(x=> buffer.push(x.data))


const main = async () => {
    const distributorAccount = await createAccountDistributor();
    createDistributor(Buffer.from(root), new BN(10), programId, distributorAccount.mint, distributorAccount.payer, distributorAccount.distributorAddress, distributorAccount.bump)
    claim(new BN(1),new BN(0), buffer, distributorAccount.mint, distributorAccount.tokenAccountSender, distributorAccount.distributorAddress)
}

main()
  .then(() => {
    console.log("Success");
  })
  .catch((e) => {
    console.error(e);
  });


