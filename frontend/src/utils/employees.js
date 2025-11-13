export const numberify = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export const resolveGrossSalary = (employee) => {
  return numberify(employee?.gross_salary)
}

export const resolveNetSalary = (employee) => {
  const net = numberify(employee?.net_salary)
  if (net > 0) return net
  const gross = resolveGrossSalary(employee)
  if (gross > 0) {
    return Number((gross * 0.82).toFixed(2))
  }
  return 0
}

export const getEmployeeTransactions = (employee, transactions = [], prices = {}) => {
  if (!employee) return []
  const results = []
  for (const tx of transactions) {
    const sym = tx.crypto_symbol
    const breakdown = Array.isArray(tx.per_employee_breakdown) ? tx.per_employee_breakdown : []
    const match = breakdown.find(item => item.user_id === employee.user_id)
    if (match) {
      const cryptoAmt = numberify(match.crypto_amount)
      const fiatAmt = numberify(match.fiat_amount)
      const currentRate = numberify(prices?.[sym])
      results.push({
        id: tx.id,
        date: tx.date,
        status: tx.status,
        tx_hash: tx.tx_hash,
        fiat_currency: tx.fiat_currency,
        crypto_symbol: sym,
        crypto_amount: cryptoAmt,
        price_at_tx: tx.price_at_tx,
        value_at_tx: fiatAmt,
        current_value: cryptoAmt * currentRate,
      })
      continue
    }
    const addr = employee?.receiving_addresses?.[sym]
    if (!addr) continue
    if (!Array.isArray(tx.addresses) || tx.addresses.length === 0) continue
    if (!tx.addresses.includes(addr)) continue
    const perShare = tx.crypto_amount / tx.addresses.length
    const valueAtTx = perShare * (tx.price_at_tx || 0)
    const currentRate = numberify(prices?.[sym])
    const currentValue = perShare * currentRate
    results.push({
      id: tx.id,
      date: tx.date,
      status: tx.status,
      tx_hash: tx.tx_hash,
      fiat_currency: tx.fiat_currency,
      crypto_symbol: sym,
      crypto_amount: perShare,
      price_at_tx: tx.price_at_tx,
      value_at_tx: valueAtTx,
      current_value: currentValue,
    })
  }
  return results
}
