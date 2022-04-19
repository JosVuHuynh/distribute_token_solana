use anchor_lang::prelude::*;
use anchor_spl::token::{self, TokenAccount, Transfer, Mint, Token };

use anchor_lang::solana_program::pubkey::Pubkey;


declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod distribute_token_solana {
    use super::*;

    pub fn create_distributor(
        ctx: Context<NewDistributor>,
        _bump:u8, 
        root:[u8; 32],
        total_claimed: u64,
    ) -> Result<()> {
        let distributor = &mut ctx.accounts.distributor;
        distributor.distributor_key = ctx.accounts.distributor_key.key();
        distributor.bump = _bump;
        distributor.root = root;
        distributor.total_claimed = total_claimed;
        distributor.mint = ctx.accounts.mint.key();

        Ok(())
    }

    pub fn claim(ctx: Context<Claim>, index: u64, amount: u64, proof: Vec<[u8; 32]>) -> Result<()> {
        //Check claim status
        let claimer = &ctx.accounts.claimer;
        let status = &mut ctx.accounts.status;
        let distributor = &mut ctx.accounts.distributor;

        if !status.is_claimed {
            return Err(Errors::AlreadyClaimed.into());
        }
        
        //Verify merkle proof
        let node = anchor_lang::solana_program::keccak::hashv(&[
            &index.to_le_bytes(),
            &claimer.key().to_bytes(),
            &amount.to_le_bytes(),
        ]);

        if !verify(proof, distributor.root, node.0) {
            return Err(Errors::InvalidMerkleProof.into());
        }

        //Mark claimed and send token
        status.amount = amount;
        status.is_claimed = true;
        status.claimer = claimer.key();
        let seeds  = [&distributor.distributor_key.key().to_bytes(), &[distributor.bump][..],];
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.sender_tokens.to_account_info(),
                    to: ctx.accounts.recipent_tokens.to_account_info(),
                    authority: ctx.accounts.distributor.to_account_info(),
                },
            )
            .with_signer(&[&seeds[..]]),
            amount,
        )?;

        Ok(())
    }

}

#[derive(Accounts)]
pub struct NewDistributor<'info> {
    pub distributor_key: Signer<'info>,

    #[account(seeds = [distributor_key.key().to_bytes().as_ref()], bump)]
    pub distributor: Account<'info, Distributor>,

    pub mint: Account<'info, Mint>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)] //state for account
    pub distributor: Account<'info, Distributor>,

    #[account(mut)]
    pub sender_tokens: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub recipent_tokens: Account<'info, TokenAccount>,

    pub claimer: Signer<'info>,

    pub status: Account<'info, Status>,

    pub token_program: Program<'info, Token>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct Distributor {
    pub distributor_key: Pubkey,

    pub bump: u8,

    pub root: [u8;32],

    pub total_claimed: u64,

    // the mint to distribute
    pub mint: Pubkey,

}   

#[account]
#[derive(Default)]
pub struct Status {
    pub is_claimed: bool,

    pub claimer: Pubkey,

    pub amount: u64,
}

#[error_code]
pub enum Errors {
    #[msg("Already Claimed")]
    AlreadyClaimed,

    #[msg("Invalid Merkle proof")]
    InvalidMerkleProof,
}

pub fn verify(proof: Vec<[u8; 32]>, root: [u8; 32], leaf: [u8; 32]) -> bool {
    let mut computed_hash = leaf;
    for proof_element in proof.into_iter() {
        if computed_hash <= proof_element {
            // Hash(current computed hash + current element of the proof)
            computed_hash =
                anchor_lang::solana_program::keccak::hashv(&[&computed_hash, &proof_element]).0;
        } else {
            // Hash(current element of the proof + current computed hash)
            computed_hash =
                anchor_lang::solana_program::keccak::hashv(&[&proof_element, &computed_hash]).0;
        }
    }
    // Check if the computed hash (root) is equal to the provided root
    computed_hash == root
}