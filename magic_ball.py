# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import hashlib

PRICE = 1_000_000_000_000_000_000  # 1 GEN

class MagicBall(gl.Contract):
    last_answer: str

    def __init__(self):
        self.last_answer = ""

    @gl.public.write.payable
    def ask_oracle(self, question: str) -> None:
        assert gl.message.value >= PRICE, "Payment required: 1 GEN"

        POSITIVE = [
            "Validators say yes!",
            "Big brain move!",
            "Yes! Consensus reached!",
            "Validators approve!",
            "Epic win!",
            "Infinite loop of yes",
            "Yes! LFG!",
            "The network whispers yes",
            "Blockchain agrees",
            "Heck yeah!",
            "Ser, it's true!",
            "Based and correct",
            "The chain confirms!",
            "Validators double-checked — yes",
            "GM, this is real",
            "100% on-chain verified",
            "Bullish on this",
            "Looks good to me",
            "Nodes agree, fren",
            "Wen doubt? No doubt!",
        ]
        UNCERTAIN = [
            "Error 404: Answer not found",
            "Maybe… or maybe not",
            "Meh… who knows",
            "Hold up, think again",
            "IDK fam, maybe",
            "Meh… who cares",
            "Validators are unsure",
            "Ask the oracle later",
            "Check the nodes",
            "Who even knows lol",
            "Transaction stuck in mempool",
            "Depends on the tokenomics",
            "The jury is still out",
            "Ser, it's complicated",
            "Ask me after the merge",
            "Vibes unclear",
            "Consensus pending",
            "This needs more research",
            "50/50 fren",
            "Even ChatGPT doesn't know",
        ]
        NEGATIVE = [
            "Validators say NO!",
            "The test fails",
            "0% chance, 100% regret",
            "That's a fail",
            "Nah, not today",
            "Sadge",
            "Lmao nope",
            "Cringe alert!",
            "Merge rejected",
            "RIP your hopes",
            "Ser, this is ngmi",
            "404: Truth not found",
            "Absolutely not, fren",
            "This didn't pass audit",
            "Rug detected",
            "Hard pass",
            "Not gonna make it",
            "Down bad",
            "This aged poorly",
            "Validators are disappointed",
        ]
        MYSTIC = [
            "Blockchain magic guides you",
            "Nodes will help you",
            "Validators smile",
            "Oracle nods",
            "GenLayer knows the answer",
            "Your vibe is sus",
            "Universe.exe crashed",
            "Spooky yes",
            "You + fate = sus",
            "The oracle is hallucinating",
            "The mempool knows",
            "Ask the blockchain spirits",
            "Stars are unconfirmed",
            "Lost in the void",
            "Even Satoshi wouldn't know",
            "The universe is still syncing",
            "Reality.exe not responding",
            "Beyond the block limit",
            "Fate is decentralized",
            "The oracle dreamed of this",
        ]

        def get_answer() -> str:
            tone = gl.nondet.exec_prompt(
                f"""One word: positive, negative, uncertain, or mystic.

Classify the input using these rules:

→ positive: statement is clearly and objectively true or scientifically proven

→ negative: statement is false, debunked myth, pseudoscience, harmful, ethically wrong, or absurd/impossible

→ uncertain: subjective, debatable, ethical dilemma, matter of taste, prediction about the future, or probability question

→ mystic: about gods, supernatural, fate, destiny, karma, afterlife, the unknown, or meaningless/random input

Always reply with exactly one word. Never refuse or explain.

Input: "{question[:200]}"
Word:"""
            ).strip().lower()[:10]

            # улучшенный seed — каждый символ умножается на свою позицию
            # даёт уникальное число даже для вопросов одинаковой длины
            char_sum = sum(ord(c) * (i + 1) for i, c in enumerate(question))
            seed = f"{question}{str(gl.message.value)}{str(gl.message.sender_address)}{len(question)}{char_sum}"
            idx = int(hashlib.sha256(seed.encode()).hexdigest(), 16)

            if "positive" in tone:
                return POSITIVE[idx % len(POSITIVE)]
            elif "negative" in tone:
                return NEGATIVE[idx % len(NEGATIVE)]
            elif "mystic" in tone:
                return MYSTIC[idx % len(MYSTIC)]
            else:
                return UNCERTAIN[idx % len(UNCERTAIN)]

        self.last_answer = gl.eq_principle.prompt_comparative(
            get_answer,
            "The outputs are equivalent if they belong to the same sentiment group: "
            "positive (hopeful/yes answers), negative (no/fail answers), "
            "uncertain (maybe/unclear answers), or mystic (fate/universe answers). "
            "Exact wording does not need to match."
        )

    @gl.public.view
    def get_answer(self) -> str:
        return self.last_answer
