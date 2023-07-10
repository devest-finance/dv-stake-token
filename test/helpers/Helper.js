const ERC20 = artifacts.require("ERC20PresetFixedSupply");
const DvStakeToken = artifacts.require("DvStakeToken");
const DvStakeTokenFactory = artifacts.require("DvStakeTokenFactory");

class Helper {

    static async setupAccountFunds(accounts, erc20Token, amount) {
        const account = accounts[0];

        // Make transaction from first account to second.
        for (let i = 2; i < 10; i++) {
            await erc20Token.transfer(accounts[i], amount, { from: account });
        }

        // Get balances of first and second account after the transactions.
        const accountOneEndingBalance = (await erc20Token.balanceOf.call(account)).toNumber();

        // send back
        assert.equal(accountOneEndingBalance, 680000000000, "Failed to transfer funds");
    }

    static async createTangible(factory, tokenAddress, name, short, value, tax, decimal, sender){
        const exampleOneContract = await factory.issue(tokenAddress, name, short, { value: 100000000 });

        const modelOneInstance = await DvStakeToken.at(exampleOneContract.logs[0].args[1]);
        const symbol = await modelOneInstance.symbol.call();

        assert.equal(symbol, "% EXP", "Failed to issue Example Contract");

        // check if variables set
        const _name = await modelOneInstance.name.call();
        assert(_name, "Example", "Invalid name on TST");

        await modelOneInstance.initialize(tax, decimal, { from: sender });

        return modelOneInstance;
    }

    static async createTangiblePresale(factory, tokenAddress, name, short, value, tax, decimal, price, sender){
        const exampleOneContract = await factory.issue(tokenAddress, name, short, { value: 100000000 });

        const modelOneInstance = await DvStakeToken.at(exampleOneContract.logs[0].args[1]);
        const symbol = await modelOneInstance.symbol.call();

        assert.equal(symbol, "% EXP", "Failed to issue Example Contract");

        // check if variables set
        const _name = await modelOneInstance.name.call();
        assert(_name, "Example", "Invalid name on TST");

        await modelOneInstance.initializePresale(tax, decimal, price, { from: sender });

        return modelOneInstance;
    }

    static async createERCBuyOrder(token, model, percent, price, address){
        // submit bid
        let escrow = price * percent;
        escrow = escrow + (escrow * 0.1)
        await token.approve(model.address, escrow, { from: address });
        await model.buy(price, percent, { from: address });
    }

    static async createERCSellOrder(token, model, percent, price, address){
        await model.sell(price, percent, { from: address });
    }

    static async getShares(model, owner){
        return (await model.getShares.call(owner)).toNumber();
    }

    static async createERCToken(name, symbol, amount, owner){
        const secondToken = await ERC20.new(name, symbol, amount, owner, {from: owner});
        return secondToken;
    }

}

module.exports = Helper;
