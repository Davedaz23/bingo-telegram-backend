/**
 * Backward compatibility alias for VirtualPointTransaction.
 * All financial transactions are now non-monetary Virtual Point ledger entries.
 */
const VirtualPointTransaction = require('./VirtualPointTransaction');

module.exports = VirtualPointTransaction;
