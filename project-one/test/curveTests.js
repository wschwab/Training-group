const { ethers } = require("hardhat");
const { expect, assert } = require("chai");

const initContracts = async (minter, minterAddress, user, userAddress) => {
    const TokenContract = await ethers.getContractFactory("CollateralToken");
    const tokenContract = await TokenContract.connect(minter).deploy();
    await tokenContract.deployed();

    const CollateralContract = await ethers.getContractFactory("MockToken");
    const collateralContract = await CollateralContract.connect(minter).deploy();
    await collateralContract.deployed();

    const CurveContract = await ethers.getContractFactory("Curve");
    const curveContract = await CurveContract.connect(minter).deploy(collateralContract.address, tokenContract.address);
    await curveContract.deployed();

    const hundred = ethers.utils.parseUnits("100", 18);
    const thousand = ethers.utils.parseUnits("1000", 18);

    expect(await tokenContract.balanceOf(minterAddress))
        .to.equal(ethers.constants.Zero);
    expect(await tokenContract.balanceOf(userAddress))
        .to.equal(ethers.constants.Zero);
    expect(await tokenContract.totalSupply())
        .to.equal(ethers.constants.Zero);

    expect(await collateralContract.balanceOf(minterAddress))
        .to.equal(ethers.constants.Zero);
    expect(await collateralContract.balanceOf(userAddress))
        .to.equal(ethers.constants.Zero);
    expect(await collateralContract.totalSupply())
        .to.equal(ethers.constants.Zero);

    collateralContract.connect(minter).mint(minterAddress, thousand);
    collateralContract.connect(user).mint(userAddress, hundred);

    expect(await collateralContract.balanceOf(minterAddress))
        .to.equal(thousand);
    expect(await collateralContract.balanceOf(userAddress))
        .to.equal(hundred);
    expect(await collateralContract.totalSupply())
        .to.equal(thousand.add(hundred.toString()));

    expect(await tokenContract.isMinter(curveContract.address))
        .to.equal(false);
    await tokenContract.connect(minter)
        .addMinter(curveContract.address);
    expect(await tokenContract.isMinter(curveContract.address))
        .to.equal(true);

    return { tokenContract, collateralContract, curveContract }
}

const mintBondedTokens = async (minter, minterAddress, contracts) => {
    const { tokenContract, collateralContract, curveContract } = contracts;
    const hundred = ethers.utils.parseUnits("100", 18);
    const thousand = ethers.utils.parseUnits("1000", 18);
    
    expect(await collateralContract.allowance(minterAddress, curveContract.address))
        .to.equal(ethers.constants.Zero);
    await collateralContract.connect(minter)
        .approve(curveContract.address, ethers.constants.MaxUint256);
    expect(await collateralContract.allowance(minterAddress, curveContract.address))
        .to.equal(ethers.constants.MaxUint256);

    const buyPrice = await curveContract.buyPrice(hundred);
        
    expect(await tokenContract.balanceOf(minterAddress))
        .to.equal(ethers.constants.Zero);
    expect(await tokenContract.totalSupply())
            .to.equal(ethers.constants.Zero);
    expect(await collateralContract.balanceOf(minterAddress))
        .to.equal(thousand);

    await curveContract.connect(minter)
        .mint(hundred);

    expect(await tokenContract.balanceOf(minterAddress))
        .to.equal(hundred);
    expect(await tokenContract.totalSupply())
        .to.equal(hundred);

    console.log("MADE IT TO LAST COLLAT BAL, AND ALL IS WELL");

    expect(await collateralContract.balanceOf(minterAddress))
        .to.equal(thousand.sub(buyPrice.toString()));

    console.log("MADE PAST TO LAST COLLAT BAL, AND ALL IS WELL");
}

const solveFunction = (a, b) => {
    const step1 = b.pow(2).sub(a.pow(2).toString());
    const step2 = step1.add((b.sub(a.toString())).mul(40));
    const step3 = step2.div(200);

    return step3;
}

describe("Curve", () => {
    let minter;
    let user;
    let tokenContract;
    let collateralContract;
    let curveContract;
    let minterAddress;
    let userAddress;
    const ten = ethers.utils.parseUnits("10", 18);
    const hundred = ethers.utils.parseUnits("100", 18);
    const thousand = ethers.utils.parseUnits("1000", 18);

    beforeEach(async () => {
        const signers = await ethers.getSigners();
        minter = signers[0];
        user = signers[1];

        minterAddress = await minter.getAddress();
        userAddress = await user.getAddress();

        const contracts = await initContracts(minter, minterAddress, user, userAddress);

        tokenContract = contracts.tokenContract;
        collateralContract = contracts.collateralContract;
        curveContract = contracts.curveContract;
    });

    describe("Curve tests", () => {
        describe("functions", async () => {
            it("returns token address for the accepted token", async () => {
                expect(await curveContract.collateralToken())
                    .to.equal(collateralContract.address);
            });

            it("returns token address for the token on the curve", async () => {
                expect(await curveContract.bondedToken())
                    .to.equal(tokenContract.address);
            });

            it("estimates buy price", async () => {
                const currentSupply = await tokenContract.totalSupply();
                const buyPrice = await curveContract.buyPrice(ten);
                
                expect(buyPrice).to.equal(solveFunction(currentSupply, currentSupply.add(ten.toString())));
            });

            it("estimates sell price", async () => {
                const contracts = { tokenContract, collateralContract, curveContract };
                await mintBondedTokens(minter, minterAddress, contracts);

                const sellPrice = await curveContract.sellReward(ten);
                
                // mintBondedToken verifies taht the supply is 100, 
                // just using that var for better readability
                expect(sellPrice).to.equal(solveFunction(hundred.sub(ten.toString()), hundred));
            });

            it("curve mints properly", async () => {
                const contracts = { tokenContract, collateralContract, curveContract };
                // mintBondedTokens checks minting
                await mintBondedTokens(minter, minterAddress, contracts);
            });

            it("curve burns properly", async () => {
                const contracts = { tokenContract, collateralContract, curveContract };
                await mintBondedTokens(minter, minterAddress, contracts);

                const origCollatBalance = await collateralContract.balanceOf(minterAddress);
                const origCollatSupply = await collateralContract.totalSupply();
                const sellPrice = await curveContract.sellReward(ten);

                await curveContract.connect(minter)
                    .burn(ten);
                expect(await tokenContract.balanceOf(minterAddress))
                    .to.equal(hundred.sub(ten.toString()));
                expect(await tokenContract.totalSupply())
                    .to.equal(hundred.sub(ten.toString()));
                expect(await collateralContract.balanceOf(minterAddress))
                    .to.equal(origCollatBalance.add(sellPrice.toString()));
                expect(await collateralContract.totalSupply())
                    .to.equal(origCollatBalance.add(sellPrice.toString()));
            });
        });

        describe("min/max values", async () => {
            it("curve can handle very small values");

            it("curve can handle very large values");
        });

        describe("stress tests", async () => {
            it("mints properly: 2500 iterations");

            it("burns properly: 2500 iterations");

            it("mints and burns properly: 2500 rounds");
        })
    })
})