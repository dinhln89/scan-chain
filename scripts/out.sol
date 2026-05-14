// Decompiled by library.dedaub.com
// 2025.11.26 07:10 UTC
// Compiled using the solidity compiler version 0.8.12


// Data structures and variables inferred from the use of storage instructions
uint256 _compound; // STORAGE[0x0]
mapping (address => address) _pendingReceivers; // STORAGE[0xf]
address _gov; // STORAGE[0x1] bytes 0 to 19
address _weth; // STORAGE[0x2] bytes 0 to 19
address _money; // STORAGE[0x3] bytes 0 to 19
address stor_4_0_19; // STORAGE[0x4] bytes 0 to 19
address stor_5_0_19; // STORAGE[0x5] bytes 0 to 19
address _mlp; // STORAGE[0x6] bytes 0 to 19
address _@_compoundMoney_2906; // STORAGE[0x7] bytes 0 to 19
address _@_stakeMoney_2989; // STORAGE[0x8] bytes 0 to 19
address _claimFees; // STORAGE[0x9] bytes 0 to 19
address _stakedMlpTracker; // STORAGE[0xa] bytes 0 to 19
address _feeMlpTracker; // STORAGE[0xb] bytes 0 to 19
address _mlpManager; // STORAGE[0xc] bytes 0 to 19
address _signalTransfer; // STORAGE[0xd] bytes 0 to 19
address _mlpVester; // STORAGE[0xe] bytes 0 to 19


// Events
UnstakeMlp(address, uint256);
StakeMlp(address, uint256);

function receive() public payable { 
    require(msg.sender == _weth, Error('Router: invalid sender'));
}

function @_nonReentrantBefore_44() private { 
    require(_compound != 2, Error('ReentrancyGuard: reentrant call'));
    _compound = 2;
    return ;
}

function withdrawToken(address _token, address _account, uint256 _amount) public nonPayable { 
    require(msg.data.length - 4 >= 96);
    require(msg.sender == _gov, Error('Governable: forbidden'));
    v0 = v1 = 0;
    while (v0 < 68) {
        MEM[v0 + MEM[64]] = MEM[v0 + (MEM[64] + 32)];
        v0 += 32;
    }
    if (v0 > 68) {
        MEM[MEM[64] + 68] = 0;
    }
    v2, /* uint256 */ v3, /* uint256 */ v4, /* uint256 */ v5 = _token.transfer(_account, _amount).gas(msg.gas);
    if (RETURNDATASIZE() == 0) {
        v6 = v7 = 96;
    } else {
        v6 = v8 = new bytes[](RETURNDATASIZE());
        RETURNDATACOPY(v8.data, 0, RETURNDATASIZE());
    }
    if (!v2) {
        require(!MEM[v6], v5, MEM[v6]);
        v9 = new bytes[](v10.length);
        v11 = v12 = 0;
        while (v11 < v10.length) {
            v9[v11] = v10[v11];
            v11 += 32;
        }
        if (v11 > v10.length) {
            v9[v10.length] = 0;
        }
        revert(Error(v9, v13, 'SafeERC20: low-level call failed'));
    } else {
        if (!MEM[v6]) {
            require(_token.code.size, Error('Address: call to non-contract'));
        }
        v14 = v15 = 0 == MEM[v6];
        if (0 != MEM[v6]) {
            require(32 + v6 + MEM[v6] - (32 + v6) >= 32);
            v14 = MEM[32 + v6];
            require(v14 == bool(v14));
        }
        require(v14, Error('SafeERC20: ERC20 operation did not succeed'));
        exit;
    }
}

function @_compound_2853(uint256 varg0) private { 
    @_compoundMoney_2906(varg0);
    @_compoundMlp_2934(varg0);
    return ;
}

function @_stakeMoney_2989(uint256 varg0, address varg1, address varg2, address varg3) private { 
    require(varg0 > 0, Error('RewardRouter: invalid _amount'));
    require(bool(_@_compoundMoney_2906.code.size));
    v0 = _@_compoundMoney_2906.stakeForAccount(varg3, varg2, varg1, varg0).gas(msg.gas);
    require(bool(v0), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(bool(_@_stakeMoney_2989.code.size));
    v1 = _@_stakeMoney_2989.stakeForAccount(varg2, varg2, _@_compoundMoney_2906, varg0).gas(msg.gas);
    require(bool(v1), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(bool(_claimFees.code.size));
    v2 = _claimFees.stakeForAccount(varg2, varg2, _@_stakeMoney_2989, varg0).gas(msg.gas);
    require(bool(v2), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    emit 0x1dfbcd1f6590f60e409b45cf63f3c8c09561f9312d6c0ba999812616a6102146(varg2, varg1, varg0);
    return ;
}

function _SafeAdd(uint256 varg0, uint256 varg1) private { 
    require(varg1 <= ~varg0, Panic(17)); // arithmetic overflow or underflow
    return varg1 + varg0;
}

function @sendValue_606(uint256 varg0, address varg1) private { 
    require(this.balance >= varg0, Error('Address: insufficient balance'));
    v0, /* uint256 */ v1 = varg1.call().value(varg0).gas(msg.gas);
    if (RETURNDATASIZE() != 0) {
        v2 = new bytes[](RETURNDATASIZE());
        v1 = v2.data;
        RETURNDATACOPY(v1, 0, RETURNDATASIZE());
    }
    require(v0, Error('Address: unable to send value, recipient may have reverted'));
    return ;
}

function gov() public nonPayable { 
    return _gov;
}

function @_unstakeMoney_3124(uint256 varg0, uint256 varg1, address varg2, address varg3) private { 
    require(varg1 > 0, Error('RewardRouter: invalid _amount'));
    v0, /* uint256 */ v1 = _@_compoundMoney_2906.stakedAmounts(varg3).gas(msg.gas);
    require(bool(v0), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(bool(_claimFees.code.size));
    v2 = _claimFees.unstakeForAccount(varg3, _@_stakeMoney_2989, varg1, varg3).gas(msg.gas);
    require(bool(v2), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(bool(_@_stakeMoney_2989.code.size));
    v3 = _@_stakeMoney_2989.unstakeForAccount(varg3, _@_compoundMoney_2906, varg1, varg3).gas(msg.gas);
    require(bool(v3), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(bool(_@_compoundMoney_2906.code.size));
    v4 = _@_compoundMoney_2906.unstakeForAccount(varg3, varg2, varg1, varg3).gas(msg.gas);
    require(bool(v4), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    if (varg0) {
        v5, /* uint256 */ v6 = _@_stakeMoney_2989.claimForAccount(varg3, varg3).gas(msg.gas);
        require(bool(v5), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
        require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
        if (v6) {
            require(bool(_claimFees.code.size));
            v7 = _claimFees.stakeForAccount(varg3, varg3, stor_5_0_19, v6).gas(msg.gas);
            require(bool(v7), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
        }
        v8, /* uint256 */ v9 = _claimFees.depositBalances(varg3, stor_5_0_19).gas(msg.gas);
        require(bool(v8), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
        require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
        if (v9) {
            v10 = _SafeMul(varg1, v9);
            v11 = _SafeDiv(v1, v10);
            require(bool(_claimFees.code.size));
            v12 = _claimFees.unstakeForAccount(varg3, stor_5_0_19, v11, varg3).gas(msg.gas);
            require(bool(v12), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
            require(bool(stor_5_0_19.code.size));
            v13 = stor_5_0_19.burn(varg3, v11).gas(msg.gas);
            require(bool(v13), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
        }
    }
    emit 0x19687a9fdae1ae3905404398301afe75236f8dee14b670c19e75697c493c54d6(varg3, varg2, varg1);
    return ;
}

function batchCompoundForAccounts(address[] _accounts) public nonPayable { 
    require(msg.data.length - 4 >= 32);
    require(_accounts <= uint64.max);
    require(4 + _accounts + 31 < msg.data.length);
    require(_accounts.length <= uint64.max, Panic(65)); // failed memory allocation (too much memory)
    v0 = new address[](_accounts.length);
    require(!((v0 + (0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0 & 32 + (_accounts.length << 5) + 31) < v0) | (v0 + (0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0 & 32 + (_accounts.length << 5) + 31) > uint64.max)), Panic(65)); // failed memory allocation (too much memory)
    v1 = v2 = v0.data;
    require(32 + (4 + _accounts + (_accounts.length << 5)) <= msg.data.length);
    v3 = v4 = _accounts.data;
    while (v3 < 32 + (4 + _accounts + (_accounts.length << 5))) {
        require(msg.data[v3] == address(msg.data[v3]));
        MEM[v1] = msg.data[v3];
        v1 += 32;
        v3 += 32;
    }
    @_nonReentrantBefore_44();
    require(msg.sender == _gov, Error('Governable: forbidden'));
    v5 = v6 = 0;
    while (1) {
        if (v5 >= v0.length) {
            _compound = 1;
            exit;
        } else {
            require(v5 < v0.length, Panic(50)); // access an out-of-bounds or negative index of bytesN array or slice
            @_compound_2853(v0[v5]);
            require(v5 != uint256.max, Panic(17)); // arithmetic overflow or underflow
            v5 += 1;
        }
    }
}

function @_validateReceiver_2839(address varg0) private { 
    v0, /* uint256 */ v1 = _@_compoundMoney_2906.averageStakedAmounts(varg0).gas(msg.gas);
    require(bool(v0), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(!v1, Error('RewardRouter: stakedMoneyTracker.averageStakedAmounts > 0'));
    v2, /* uint256 */ v3 = _@_compoundMoney_2906.cumulativeRewards(varg0).gas(msg.gas);
    require(bool(v2), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(!v3, Error('RewardRouter: stakedMoneyTracker.cumulativeRewards > 0'));
    v4, /* uint256 */ v5 = _@_stakeMoney_2989.averageStakedAmounts(varg0).gas(msg.gas);
    require(bool(v4), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(!v5, Error('RewardRouter: bonusMoneyTracker.averageStakedAmounts > 0'));
    v6, /* uint256 */ v7 = _@_stakeMoney_2989.cumulativeRewards(varg0).gas(msg.gas);
    require(bool(v6), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(!v7, Error('RewardRouter: bonusMoneyTracker.cumulativeRewards > 0'));
    v8, /* uint256 */ v9 = _claimFees.averageStakedAmounts(varg0).gas(msg.gas);
    require(bool(v8), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(!v9, Error('RewardRouter: feeMoneyTracker.averageStakedAmounts > 0'));
    v10, /* uint256 */ v11 = _claimFees.cumulativeRewards(varg0).gas(msg.gas);
    require(bool(v10), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(!v11, Error('RewardRouter: feeMoneyTracker.cumulativeRewards > 0'));
    v12, /* uint256 */ v13 = _signalTransfer.transferredAverageStakedAmounts(varg0).gas(msg.gas);
    require(bool(v12), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(!v13, Error('RewardRouter: moneyVester.transferredAverageStakedAmounts > 0'));
    v14, /* uint256 */ v15 = _signalTransfer.transferredCumulativeRewards(varg0).gas(msg.gas);
    require(bool(v14), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(!v15, Error('RewardRouter: moneyVester.transferredCumulativeRewards > 0'));
    v16, /* uint256 */ v17 = _stakedMlpTracker.averageStakedAmounts(varg0).gas(msg.gas);
    require(bool(v16), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(!v17, Error('RewardRouter: stakedMlpTracker.averageStakedAmounts > 0'));
    v18, /* uint256 */ v19 = _stakedMlpTracker.cumulativeRewards(varg0).gas(msg.gas);
    require(bool(v18), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(!v19, Error('RewardRouter: stakedMlpTracker.cumulativeRewards > 0'));
    v20, /* uint256 */ v21 = _feeMlpTracker.averageStakedAmounts(varg0).gas(msg.gas);
    require(bool(v20), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(!v21, Error('RewardRouter: feeMlpTracker.averageStakedAmounts > 0'));
    v22, /* uint256 */ v23 = _feeMlpTracker.cumulativeRewards(varg0).gas(msg.gas);
    require(bool(v22), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(!v23, Error('RewardRouter: feeMlpTracker.cumulativeRewards > 0'));
    v24, /* uint256 */ v25 = _mlpVester.transferredAverageStakedAmounts(varg0).gas(msg.gas);
    require(bool(v24), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(!v25, Error('RewardRouter: moneyVester.transferredAverageStakedAmounts > 0'));
    v26, /* uint256 */ v27 = _mlpVester.transferredCumulativeRewards(varg0).gas(msg.gas);
    require(bool(v26), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(!v27, Error('RewardRouter: moneyVester.transferredCumulativeRewards > 0'));
    v28, /* uint256 */ v29 = _signalTransfer.balanceOf(varg0).gas(msg.gas);
    require(bool(v28), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(!v29, Error('RewardRouter: moneyVester.balance > 0'));
    v30, /* uint256 */ v31 = _mlpVester.balanceOf(varg0).gas(msg.gas);
    require(bool(v30), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(!v31, Error('RewardRouter: mlpVester.balance > 0'));
    return ;
}

function 0x1b3cae94() public nonPayable { 
    return _signalTransfer;
}

function 0x1dc1b8e8(address varg0, uint256 varg1) public nonPayable { 
    require(msg.data.length - 4 >= 64);
    @_nonReentrantBefore_44();
    require(msg.sender == _gov, Error('Governable: forbidden'));
    @_stakeMoney_2989(varg1, _money, varg0, msg.sender);
    _compound = 1;
}

function compoundForAccount(address _account) public nonPayable { 
    require(msg.data.length - 4 >= 32);
    @_nonReentrantBefore_44();
    require(msg.sender == _gov, Error('Governable: forbidden'));
    @_compound_2853(_account);
    _compound = 1;
}

function handleRewards(bool _shouldClaimGmx, bool _shouldStakeGmx, bool _shouldClaimEsGmx, bool _shouldStakeEsGmx, bool _shouldStakeMultiplierPoints, bool _shouldClaimWeth, bool _shouldConvertWethToEth) public nonPayable { 
    require(msg.data.length - 4 >= 224);
    @_nonReentrantBefore_44();
    v0 = v1 = 0;
    if (_shouldClaimGmx) {
        v2, /* uint256 */ v3 = _signalTransfer.claimForAccount(msg.sender, msg.sender).gas(msg.gas);
        require(bool(v2), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
        require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
        v4, /* uint256 */ v5 = _mlpVester.claimForAccount(msg.sender, msg.sender).gas(msg.gas);
        require(bool(v4), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
        require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
        v0 = v6 = _SafeAdd(v5, v3);
    }
    if (_shouldStakeGmx) {
        v7 = v0 > 0;
    }
    if (v7) {
        @_stakeMoney_2989(v0, _money, msg.sender, msg.sender);
    }
    v8 = v9 = 0;
    if (_shouldClaimEsGmx) {
        v10, /* uint256 */ v11 = _@_compoundMoney_2906.claimForAccount(msg.sender, msg.sender).gas(msg.gas);
        require(bool(v10), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
        require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
        v12, /* uint256 */ v13 = _stakedMlpTracker.claimForAccount(msg.sender, msg.sender).gas(msg.gas);
        require(bool(v12), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
        require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
        v8 = v14 = _SafeAdd(v13, v11);
    }
    if (_shouldStakeEsGmx) {
        v15 = v8 > 0;
    }
    if (v15) {
        @_stakeMoney_2989(v8, stor_4_0_19, msg.sender, msg.sender);
    }
    if (_shouldStakeMultiplierPoints) {
        v16, /* uint256 */ v17 = _@_stakeMoney_2989.claimForAccount(msg.sender, msg.sender).gas(msg.gas);
        require(bool(v16), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
        require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
        if (v17) {
            require(bool(_claimFees.code.size));
            v18 = _claimFees.stakeForAccount(msg.sender, msg.sender, stor_5_0_19, v17).gas(msg.gas);
            require(bool(v18), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
        }
    }
    if (_shouldClaimWeth) {
        if (!_shouldConvertWethToEth) {
            v19, /* uint256 */ v20 = _claimFees.claimForAccount(msg.sender, msg.sender).gas(msg.gas);
            require(bool(v19), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
            require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
            v21, /* uint256 */ v22 = _feeMlpTracker.claimForAccount(msg.sender, msg.sender).gas(msg.gas);
            require(bool(v21), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
            require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
        } else {
            v23, /* uint256 */ v24 = _claimFees.claimForAccount(msg.sender, address(this)).gas(msg.gas);
            require(bool(v23), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
            require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
            v25, /* uint256 */ v26 = _feeMlpTracker.claimForAccount(msg.sender, address(this)).gas(msg.gas);
            require(bool(v25), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
            require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
            v27 = _SafeAdd(v26, v24);
            require(bool(_weth.code.size));
            v28 = _weth.withdraw(v27).gas(msg.gas);
            require(bool(v28), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
            @sendValue_606(v27, msg.sender);
        }
    }
    _compound = 1;
}

function 0x33eb90d4() public nonPayable { 
    return _@_stakeMoney_2989;
}

function 0x37490830() public nonPayable { 
    return _@_compoundMoney_2906;
}

function mlp() public nonPayable { 
    return _mlp;
}

function @_compoundMoney_2906(uint256 varg0) private { 
    v0, /* uint256 */ v1 = _@_compoundMoney_2906.claimForAccount(address(varg0), address(varg0)).gas(msg.gas);
    require(bool(v0), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    if (v1) {
        @_stakeMoney_2989(v1, stor_4_0_19, varg0, varg0);
    }
    v2, /* uint256 */ v3 = _@_stakeMoney_2989.claimForAccount(address(varg0), address(varg0)).gas(msg.gas);
    require(bool(v2), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    if (!v3) {
        return ;
    } else {
        require(bool(_claimFees.code.size));
        v4 = _claimFees.stakeForAccount(address(varg0), address(varg0), stor_5_0_19, v3).gas(msg.gas);
        require(bool(v4), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
        return ;
    }
}

function weth() public nonPayable { 
    return _weth;
}

function @_compoundMlp_2934(uint256 varg0) private { 
    v0, /* uint256 */ v1 = _stakedMlpTracker.claimForAccount(address(varg0), address(varg0)).gas(msg.gas);
    require(bool(v0), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    if (!v1) {
        return ;
    } else {
        @_stakeMoney_2989(v1, stor_4_0_19, varg0, varg0);
        return ;
    }
}

function _SafeMul(uint256 varg0, uint256 varg1) private { 
    require(!(bool(varg1) & (varg0 > uint256.max / varg1)), Panic(17)); // arithmetic overflow or underflow
    return varg1 * varg0;
}

function _SafeDiv(uint256 varg0, uint256 varg1) private { 
    require(varg0, Panic(18)); // division by zero
    return varg1 / varg0;
}

function 0x481f1444(uint256 varg0) public nonPayable { 
    require(msg.data.length - 4 >= 32);
    @_nonReentrantBefore_44();
    @_unstakeMoney_3124(1, varg0, stor_4_0_19, msg.sender);
    _compound = 1;
}

function money() public nonPayable { 
    return _money;
}

function claim() public nonPayable { 
    @_nonReentrantBefore_44();
    v0, /* uint256 */ v1 = _claimFees.claimForAccount(msg.sender, msg.sender).gas(msg.gas);
    require(bool(v0), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    v2, /* uint256 */ v3 = _feeMlpTracker.claimForAccount(msg.sender, msg.sender).gas(msg.gas);
    require(bool(v2), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    v4, /* uint256 */ v5 = _@_compoundMoney_2906.claimForAccount(msg.sender, msg.sender).gas(msg.gas);
    require(bool(v4), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    v6, /* uint256 */ v7 = _stakedMlpTracker.claimForAccount(msg.sender, msg.sender).gas(msg.gas);
    require(bool(v6), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    _compound = 1;
}

function 0x52deaf5e(uint256 varg0) public nonPayable { 
    require(msg.data.length - 4 >= 32);
    @_nonReentrantBefore_44();
    @_stakeMoney_2989(varg0, stor_4_0_19, msg.sender, msg.sender);
    _compound = 1;
}

function unstakeAndRedeemMlpETH(uint256 _mlpAmount, uint256 _minOut, address _receiver) public nonPayable { 
    require(msg.data.length - 4 >= 96);
    @_nonReentrantBefore_44();
    require(_mlpAmount > 0, Error('RewardRouter: invalid _mlpAmount'));
    require(bool(_stakedMlpTracker.code.size));
    v0 = _stakedMlpTracker.unstakeForAccount(msg.sender, _feeMlpTracker, _mlpAmount, msg.sender).gas(msg.gas);
    require(bool(v0), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(bool(_feeMlpTracker.code.size));
    v1 = _feeMlpTracker.unstakeForAccount(msg.sender, _mlp, _mlpAmount, msg.sender).gas(msg.gas);
    require(bool(v1), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    v2, /* uint256 */ v3 = _mlpManager.removeLiquidityForAccount(msg.sender, _weth, _mlpAmount, _minOut, this).gas(msg.gas);
    require(bool(v2), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(bool(_weth.code.size));
    v4 = _weth.withdraw(v3).gas(msg.gas);
    require(bool(v4), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    @sendValue_606(v3, _receiver);
    emit UnstakeMlp(msg.sender, _mlpAmount);
    _compound = 1;
    return v3;
}

function unstakeAndRedeemMlp(address _tokenOut, uint256 _mlpAmount, uint256 _minOut, address _receiver) public nonPayable { 
    require(msg.data.length - 4 >= 128);
    @_nonReentrantBefore_44();
    require(_mlpAmount > 0, Error('RewardRouter: invalid _mlpAmount'));
    require(bool(_stakedMlpTracker.code.size));
    v0 = _stakedMlpTracker.unstakeForAccount(msg.sender, _feeMlpTracker, _mlpAmount, msg.sender).gas(msg.gas);
    require(bool(v0), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(bool(_feeMlpTracker.code.size));
    v1 = _feeMlpTracker.unstakeForAccount(msg.sender, _mlp, _mlpAmount, msg.sender).gas(msg.gas);
    require(bool(v1), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    v2, /* uint256 */ v3 = _mlpManager.removeLiquidityForAccount(msg.sender, _tokenOut, _mlpAmount, _minOut, _receiver).gas(msg.gas);
    require(bool(v2), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    emit UnstakeMlp(msg.sender, _mlpAmount);
    _compound = 1;
    return v3;
}

function 0x54327ef1(uint256 varg0) public nonPayable { 
    require(msg.data.length - 4 >= 32);
    @_nonReentrantBefore_44();
    @_stakeMoney_2989(varg0, _money, msg.sender, msg.sender);
    _compound = 1;
}

function 0x6452755d(address[] varg0, uint256 varg1) public nonPayable { 
    require(msg.data.length - 4 >= 64);
    require(varg0 <= uint64.max);
    require(4 + varg0 + 31 < msg.data.length);
    require(varg0.length <= uint64.max, Panic(65)); // failed memory allocation (too much memory)
    v0 = new address[](varg0.length);
    require(!((v0 + (0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0 & 32 + (varg0.length << 5) + 31) < v0) | (v0 + (0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0 & 32 + (varg0.length << 5) + 31) > uint64.max)), Panic(65)); // failed memory allocation (too much memory)
    v1 = v2 = v0.data;
    require(32 + (4 + varg0 + (varg0.length << 5)) <= msg.data.length);
    v3 = v4 = varg0.data;
    while (v3 < 32 + (4 + varg0 + (varg0.length << 5))) {
        require(msg.data[v3] == address(msg.data[v3]));
        MEM[v1] = msg.data[v3];
        v1 += 32;
        v3 += 32;
    }
    require(varg1 <= uint64.max);
    require(msg.data.length > 4 + varg1 + 31);
    require(varg1.length <= uint64.max, Panic(65)); // failed memory allocation (too much memory)
    v5 = new uint256[](varg1.length);
    require(!((v5 + (0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0 & 32 + (varg1.length << 5) + 31) < v5) | (v5 + (0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0 & 32 + (varg1.length << 5) + 31) > uint64.max)), Panic(65)); // failed memory allocation (too much memory)
    v6 = v7 = v5.data;
    require(32 + (4 + varg1 + (varg1.length << 5)) <= msg.data.length);
    v8 = v9 = varg1.data;
    while (v8 < 32 + (4 + varg1 + (varg1.length << 5))) {
        MEM[v6] = msg.data[v8];
        v8 += 32;
        v6 += 32;
    }
    @_nonReentrantBefore_44();
    require(msg.sender == _gov, Error('Governable: forbidden'));
    v10 = v11 = 0;
    while (1) {
        if (v10 >= v0.length) {
            _compound = 1;
            exit;
        } else {
            require(v10 < v0.length, Panic(50)); // access an out-of-bounds or negative index of bytesN array or slice
            require(v10 < v5.length, Panic(50)); // access an out-of-bounds or negative index of bytesN array or slice
            require(v5[v10] > 0, Error('RewardRouter: invalid _amount'));
            require(bool(_@_compoundMoney_2906.code.size));
            v12 = _@_compoundMoney_2906.stakeForAccount(msg.sender, address(v0[v10]), _money, v5[v10]).gas(msg.gas);
            require(bool(v12), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
            require(bool(_@_stakeMoney_2989.code.size));
            v13 = _@_stakeMoney_2989.stakeForAccount(address(v0[v10]), address(v0[v10]), _@_compoundMoney_2906, v5[v10]).gas(msg.gas);
            require(bool(v13), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
            require(bool(_claimFees.code.size));
            v14 = _claimFees.stakeForAccount(address(v0[v10]), address(v0[v10]), _@_stakeMoney_2989, v5[v10]).gas(msg.gas);
            require(bool(v14), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
            emit 0x1dfbcd1f6590f60e409b45cf63f3c8c09561f9312d6c0ba999812616a6102146(address(v0[v10]), _money, v5[v10]);
            require(v10 != uint256.max, Panic(17)); // arithmetic overflow or underflow
            v10 += 1;
        }
    }
}

function acceptTransfer(address _sender) public nonPayable { 
    require(msg.data.length - 4 >= 32);
    @_nonReentrantBefore_44();
    v0, /* uint256 */ v1 = _signalTransfer.balanceOf(_sender).gas(msg.gas);
    require(bool(v0), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(!v1, Error('RewardRouter: sender has vested tokens'));
    v2, /* uint256 */ v3 = _mlpVester.balanceOf(_sender).gas(msg.gas);
    require(bool(v2), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(!v3, Error('RewardRouter: sender has vested tokens'));
    require(msg.sender == _pendingReceivers[_sender], Error('RewardRouter: transfer not signalled', 'RewardRouter: transfer not signalled'));
    _pendingReceivers[_sender] = 0;
    @_validateReceiver_2839(msg.sender);
    @_compound_2853(_sender);
    v4, /* uint256 */ v5 = _@_compoundMoney_2906.depositBalances(_sender, _money).gas(msg.gas);
    require(bool(v4), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    if (v5) {
        @_unstakeMoney_3124(0, v5, _money, _sender);
        @_stakeMoney_2989(v5, _money, msg.sender, _sender);
    }
    v6, /* uint256 */ v7 = _@_compoundMoney_2906.depositBalances(_sender, stor_4_0_19).gas(msg.gas);
    require(bool(v6), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    if (v7) {
        @_unstakeMoney_3124(0, v7, stor_4_0_19, _sender);
        @_stakeMoney_2989(v7, stor_4_0_19, msg.sender, _sender);
    }
    v8, /* uint256 */ v9 = _claimFees.depositBalances(_sender, stor_5_0_19).gas(msg.gas);
    require(bool(v8), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    if (v9) {
        require(bool(_claimFees.code.size));
        v10 = _claimFees.unstakeForAccount(_sender, stor_5_0_19, v9, _sender).gas(msg.gas);
        require(bool(v10), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
        require(bool(_claimFees.code.size));
        v11 = _claimFees.stakeForAccount(_sender, msg.sender, stor_5_0_19, v9).gas(msg.gas);
        require(bool(v11), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    }
    v12, /* uint256 */ v13 = stor_4_0_19.balanceOf(_sender).gas(msg.gas);
    require(bool(v12), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    if (v13) {
        v14, /* bool */ v15 = stor_4_0_19.transferFrom(_sender, msg.sender, v13).gas(msg.gas);
        require(bool(v14), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
        require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
        require(v15 == bool(v15));
    }
    v16, /* uint256 */ v17 = _feeMlpTracker.depositBalances(_sender, _mlp).gas(msg.gas);
    require(bool(v16), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    if (v17) {
        require(bool(_stakedMlpTracker.code.size));
        v18 = _stakedMlpTracker.unstakeForAccount(_sender, _feeMlpTracker, v17, _sender).gas(msg.gas);
        require(bool(v18), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
        require(bool(_feeMlpTracker.code.size));
        v19 = _feeMlpTracker.unstakeForAccount(_sender, _mlp, v17, _sender).gas(msg.gas);
        require(bool(v19), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
        require(bool(_feeMlpTracker.code.size));
        v20 = _feeMlpTracker.stakeForAccount(_sender, msg.sender, _mlp, v17).gas(msg.gas);
        require(bool(v20), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
        require(bool(_stakedMlpTracker.code.size));
        v21 = _stakedMlpTracker.stakeForAccount(msg.sender, msg.sender, _feeMlpTracker, v17).gas(msg.gas);
        require(bool(v21), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    }
    require(bool(_signalTransfer.code.size));
    v22 = _signalTransfer.transferStakeValues(_sender, msg.sender).gas(msg.gas);
    require(bool(v22), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(bool(_mlpVester.code.size));
    v23 = _mlpVester.transferStakeValues(_sender, msg.sender).gas(msg.gas);
    require(bool(v23), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    _compound = 1;
}

function 0x74e73eef() public nonPayable { 
    @_nonReentrantBefore_44();
    v0, /* uint256 */ v1 = _@_compoundMoney_2906.claimForAccount(msg.sender, msg.sender).gas(msg.gas);
    require(bool(v0), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    v2, /* uint256 */ v3 = _stakedMlpTracker.claimForAccount(msg.sender, msg.sender).gas(msg.gas);
    require(bool(v2), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    _compound = 1;
}

function 0x811dff50() public nonPayable { 
    return _claimFees;
}

function mintAndStakeMlpETH(uint256 _minUsdg, uint256 _minMlp) public payable { 
    require(msg.data.length - 4 >= 64);
    @_nonReentrantBefore_44();
    require(msg.value > 0, Error('RewardRouter: invalid msg.value'));
    require(bool(_weth.code.size));
    v0 = _weth.deposit().value(msg.value).gas(msg.gas);
    require(bool(v0), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    v1, /* bool */ v2 = _weth.approve(_mlpManager, msg.value).gas(msg.gas);
    require(bool(v1), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(v2 == bool(v2));
    v3, /* uint256 */ v4 = _mlpManager.addLiquidityForAccount(address(this), msg.sender, _weth, msg.value, _minUsdg, _minMlp).gas(msg.gas);
    require(bool(v3), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(bool(_feeMlpTracker.code.size));
    v5 = _feeMlpTracker.stakeForAccount(msg.sender, msg.sender, _mlp, v4).gas(msg.gas);
    require(bool(v5), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(bool(_stakedMlpTracker.code.size));
    v6 = _stakedMlpTracker.stakeForAccount(msg.sender, msg.sender, _feeMlpTracker, v4).gas(msg.gas);
    require(bool(v6), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    emit StakeMlp(msg.sender, v4);
    _compound = 1;
    return v4;
}

function 0x9e86e2a7() public nonPayable { 
    return stor_5_0_19;
}

function 0xb137cb36() public nonPayable { 
    return stor_4_0_19;
}

function mlpVester() public nonPayable { 
    return _mlpVester;
}

function 0xbe624caa(uint256 varg0) public nonPayable { 
    require(msg.data.length - 4 >= 32);
    @_nonReentrantBefore_44();
    @_unstakeMoney_3124(1, varg0, _money, msg.sender);
    _compound = 1;
}

function mlpManager() public nonPayable { 
    return _mlpManager;
}

function setGov(address varg0) public nonPayable { 
    require(msg.data.length - 4 >= 32);
    require(msg.sender == _gov, Error('Governable: forbidden'));
    _gov = varg0;
}

function claimFees() public nonPayable { 
    @_nonReentrantBefore_44();
    v0, /* uint256 */ v1 = _claimFees.claimForAccount(msg.sender, msg.sender).gas(msg.gas);
    require(bool(v0), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    v2, /* uint256 */ v3 = _feeMlpTracker.claimForAccount(msg.sender, msg.sender).gas(msg.gas);
    require(bool(v2), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    _compound = 1;
}

function stakedMlpTracker() public nonPayable { 
    return _stakedMlpTracker;
}

function pendingReceivers(address varg0) public nonPayable { 
    require(msg.data.length - 4 >= 32);
    return _pendingReceivers[varg0];
}

function initialize(address varg0, address varg1, address varg2, address varg3, address varg4, address varg5, address varg6, address varg7, address varg8, address varg9, address varg10, address varg11, address varg12) public nonPayable { 
    require(msg.data.length - 4 >= 416);
    v0 = new struct(13);
    require(!((v0 + 416 < v0) | (v0 + 416 > uint64.max)), Panic(65)); // failed memory allocation (too much memory)
    v0.word0 = varg0;
    v0.word1 = varg1;
    v0.word2 = varg2;
    v0.word3 = varg3;
    v0.word4 = varg4;
    v0.word5 = varg5;
    v0.word6 = varg6;
    v0.word7 = varg7;
    v0.word8 = varg8;
    v0.word9 = varg9;
    v0.word10 = varg10;
    v0.word11 = varg11;
    v0.word12 = varg12;
    require(msg.sender == _gov, Error('Governable: forbidden'));
    _weth = v0.word0;
    _money = v0.word1;
    stor_4_0_19 = v0.word2;
    stor_5_0_19 = v0.word3;
    _mlp = v0.word4;
    _@_compoundMoney_2906 = v0.word5;
    _@_stakeMoney_2989 = v0.word6;
    _claimFees = v0.word7;
    _feeMlpTracker = v0.word8;
    _stakedMlpTracker = v0.word9;
    _mlpManager = v0.word10;
    _signalTransfer = v0.word11;
    _mlpVester = v0.word12;
}

function signalTransfer(address _receiver) public nonPayable { 
    require(msg.data.length - 4 >= 32);
    @_nonReentrantBefore_44();
    v0, /* uint256 */ v1 = _signalTransfer.balanceOf(msg.sender).gas(msg.gas);
    require(bool(v0), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(!v1, Error('RewardRouter: sender has vested tokens'));
    v2, /* uint256 */ v3 = _mlpVester.balanceOf(msg.sender).gas(msg.gas);
    require(bool(v2), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(!v3, Error('RewardRouter: sender has vested tokens'));
    @_validateReceiver_2839(_receiver);
    _pendingReceivers[msg.sender] = _receiver;
    _compound = 1;
}

function mintAndStakeMlp(address _token, uint256 _amount, uint256 _minUsdg, uint256 _minMlp) public nonPayable { 
    require(msg.data.length - 4 >= 128);
    @_nonReentrantBefore_44();
    require(_amount > 0, Error('RewardRouter: invalid _amount'));
    v0, /* uint256 */ v1 = _mlpManager.addLiquidityForAccount(msg.sender, msg.sender, _token, _amount, _minUsdg, _minMlp).gas(msg.gas);
    require(bool(v0), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(MEM[64] + RETURNDATASIZE() - MEM[64] >= 32);
    require(bool(_feeMlpTracker.code.size));
    v2 = _feeMlpTracker.stakeForAccount(msg.sender, msg.sender, _mlp, v1).gas(msg.gas);
    require(bool(v2), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    require(bool(_stakedMlpTracker.code.size));
    v3 = _stakedMlpTracker.stakeForAccount(msg.sender, msg.sender, _feeMlpTracker, v1).gas(msg.gas);
    require(bool(v3), 0, RETURNDATASIZE()); // checks call status, propagates error data on error
    emit StakeMlp(msg.sender, v1);
    _compound = 1;
    return v1;
}

function compound() public nonPayable { 
    @_nonReentrantBefore_44();
    @_compound_2853(msg.sender);
    _compound = 1;
}

function feeMlpTracker() public nonPayable { 
    return _feeMlpTracker;
}

// Note: The function selector is not present in the original solidity code.
// However, we display it for the sake of completeness.

function __function_selector__( function_selector) public payable { 
    MEM[64] = 128;
    if (msg.data.length < 4) {
        require(!msg.data.length);
        receive();
    } else {
        v0 = function_selector >> 224;
        if (0x6452755d > v0) {
            if (0x3e49e213 > v0) {
                if (0x1dc1b8e8 > v0) {
                    if (0x1e33667 == v0) {
                        withdrawToken(address,address,uint256);
                    } else if (0x12d43a51 == v0) {
                        gov();
                    } else if (0x1af276a6 == v0) {
                        batchCompoundForAccounts(address[]);
                    } else {
                        require(0x1b3cae94 == v0);
                        0x1b3cae94();
                    }
                } else if (0x1dc1b8e8 == v0) {
                    0x1dc1b8e8();
                } else if (0x2a9f4083 == v0) {
                    compoundForAccount(address);
                } else if (0x30b70002 == v0) {
                    handleRewards(bool,bool,bool,bool,bool,bool,bool);
                } else if (0x33eb90d4 == v0) {
                    0x33eb90d4();
                } else {
                    require(0x37490830 == v0);
                    0x37490830();
                }
            } else if (0x4e71d92d > v0) {
                if (0x3e49e213 == v0) {
                    mlp();
                } else if (0x3fc8cef3 == v0) {
                    weth();
                } else if (0x481f1444 == v0) {
                    0x481f1444();
                } else {
                    require(0x4ddd108a == v0);
                    money();
                }
            } else if (0x4e71d92d == v0) {
                claim();
            } else if (0x52deaf5e == v0) {
                0x52deaf5e();
            } else if (0x5387701e == v0) {
                unstakeAndRedeemMlpETH(uint256,uint256,address);
            } else if (0x53f33a55 == v0) {
                unstakeAndRedeemMlp(address,uint256,uint256,address);
            } else {
                require(0x54327ef1 == v0);
                0x54327ef1();
            }
        } else if (0xcbb91c5e > v0) {
            if (0x944b4e5f > v0) {
                if (0x6452755d == v0) {
                    0x6452755d();
                } else if (0x655603a4 == v0) {
                    acceptTransfer(address);
                } else if (0x74e73eef == v0) {
                    0x74e73eef();
                } else {
                    require(0x811dff50 == v0);
                    0x811dff50();
                }
            } else if (0x944b4e5f == v0) {
                mintAndStakeMlpETH(uint256,uint256);
            } else if (0x9e86e2a7 == v0) {
                0x9e86e2a7();
            } else if (0xb137cb36 == v0) {
                0xb137cb36();
            } else if (0xb2a39a2a == v0) {
                mlpVester();
            } else {
                require(0xbe624caa == v0);
                0xbe624caa();
            }
        } else if (0xef4500d8 > v0) {
            if (0xcbb91c5e == v0) {
                mlpManager();
            } else if (0xcfad57a2 == v0) {
                setGov(address);
            } else if (0xd294f093 == v0) {
                claimFees();
            } else if (0xd4d933f0 == v0) {
                stakedMlpTracker();
            } else {
                require(0xe1b9db89 == v0);
                pendingReceivers(address);
            }
        } else if (0xef4500d8 == v0) {
            initialize((address,address,address,address,address,address,address,address,address,address,address,address,address));
        } else if (0xef9aacfd == v0) {
            signalTransfer(address);
        } else if (0xf5e35879 == v0) {
            mintAndStakeMlp(address,uint256,uint256,uint256);
        } else if (0xf69e2046 == v0) {
            compound();
        } else {
            require(0xfc8b6fc1 == v0);
            feeMlpTracker();
        }
    }
}
