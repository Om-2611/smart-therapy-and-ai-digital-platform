'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { doc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logModuleEvent } from '@/lib/sessionEvents'

interface VirtualShopProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

interface ShopItem {
  id: string; emoji: string; name: string; price: number; aisle: string
}

interface BasketItem {
  itemId: string; quantity: number; price: number
}

interface ListItem {
  itemId: string; quantity: number
}

interface Receipt {
  items: BasketItem[]; total: number; paid: number; change: number; timestamp: number
}

const AISLES = [
  { id: 'all', label: 'All', emoji: '' },
  { id: 'fruits', label: 'Fruits & Veg', emoji: '🍎' },
  { id: 'dairy', label: 'Dairy', emoji: '🥛' },
  { id: 'snacks', label: 'Snacks & Drinks', emoji: '🍪' },
  { id: 'household', label: 'Household', emoji: '🧴' },
]

const SHOP_ITEMS: ShopItem[] = [
  { id: 'apple', emoji: '🍎', name: 'Apple', price: 10, aisle: 'fruits' },
  { id: 'banana', emoji: '🍌', name: 'Banana', price: 5, aisle: 'fruits' },
  { id: 'orange', emoji: '🍊', name: 'Orange', price: 12, aisle: 'fruits' },
  { id: 'carrot', emoji: '🥕', name: 'Carrot', price: 8, aisle: 'fruits' },
  { id: 'tomato', emoji: '🍅', name: 'Tomato', price: 6, aisle: 'fruits' },
  { id: 'broccoli', emoji: '🥦', name: 'Broccoli', price: 15, aisle: 'fruits' },
  { id: 'grapes', emoji: '🍇', name: 'Grapes', price: 20, aisle: 'fruits' },
  { id: 'potato', emoji: '🥔', name: 'Potato', price: 4, aisle: 'fruits' },
  { id: 'milk', emoji: '🥛', name: 'Milk', price: 25, aisle: 'dairy' },
  { id: 'butter', emoji: '🧈', name: 'Butter', price: 30, aisle: 'dairy' },
  { id: 'eggs', emoji: '🥚', name: 'Eggs', price: 20, aisle: 'dairy' },
  { id: 'cheese', emoji: '🧀', name: 'Cheese', price: 40, aisle: 'dairy' },
  { id: 'bread', emoji: '🍞', name: 'Bread', price: 18, aisle: 'dairy' },
  { id: 'cereal', emoji: '🥣', name: 'Cereal', price: 35, aisle: 'dairy' },
  { id: 'biscuits', emoji: '🍪', name: 'Biscuits', price: 15, aisle: 'snacks' },
  { id: 'chocolate', emoji: '🍫', name: 'Chocolate', price: 25, aisle: 'snacks' },
  { id: 'juice', emoji: '🧃', name: 'Juice', price: 20, aisle: 'snacks' },
  { id: 'popcorn', emoji: '🍿', name: 'Popcorn', price: 12, aisle: 'snacks' },
  { id: 'cold-drink', emoji: '🥤', name: 'Cold Drink', price: 18, aisle: 'snacks' },
  { id: 'donut', emoji: '🍩', name: 'Donut', price: 10, aisle: 'snacks' },
  { id: 'shampoo', emoji: '🧴', name: 'Shampoo', price: 50, aisle: 'household' },
  { id: 'toothbrush', emoji: '🪥', name: 'Toothbrush', price: 20, aisle: 'household' },
  { id: 'soap', emoji: '🧼', name: 'Soap', price: 15, aisle: 'household' },
  { id: 'tissue', emoji: '🧻', name: 'Tissue', price: 10, aisle: 'household' },
  { id: 'pen', emoji: '📎', name: 'Pen', price: 5, aisle: 'household' },
  { id: 'notebook', emoji: '📓', name: 'Notebook', price: 30, aisle: 'household' },
]

const ITEM_MAP = new Map(SHOP_ITEMS.map(i => [i.id, i]))

const DIFFICULTY_MAP: Record<string, { wallet: number; listCount: number }> = {
  easy: { wallet: 50, listCount: 2 },
  medium: { wallet: 100, listCount: 3 },
  hard: { wallet: 75, listCount: 4 },
}

const CURRENCIES: Record<string, string> = { rupee: '₹', dollar: '$', pound: '£' }

function fmtPrice(amt: number, cur: string): string {
  const s = CURRENCIES[cur] || '₹'
  return `${s}${amt}`
}

export default function VirtualShop({ sessionId, role, isLocked }: VirtualShopProps) {
  const isT = role === 'therapist'
  const canInteract = isT || !isLocked

  const [difficulty, setDifficulty] = useState('medium')
  const [currency, setCurrency] = useState('rupee')
  const [aisle, setAisle] = useState('all')
  const [shoppingList, setShoppingList] = useState<ListItem[]>([])
  const [walletAmount, setWalletAmount] = useState(100)
  const [walletBalance, setWalletBalance] = useState(100)
  const [basket, setBasket] = useState<BasketItem[]>([])
  const [score, setScore] = useState(0)
  const [completed, setCompleted] = useState(false)
  const [purchaseHistory, setPurchaseHistory] = useState<object[]>([])

  const [basketOpen, setBasketOpen] = useState(false)
  const [editList, setEditList] = useState(false)
  const [editQty, setEditQty] = useState<Record<string, number>>({})
  const [paying, setPaying] = useState(false)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [floaters, setFloaters] = useState<{ id: string; x: number; y: number }[]>([])
  const [toast, setToast] = useState<{ msg: string } | null>(null)

  const cRef = useRef<HTMLDivElement>(null)
  const toastT = useRef<ReturnType<typeof setTimeout>>()
  const pk = useRef(0)

  const write = useCallback(async (d: Record<string, unknown>) => {
    try { await updateDoc(doc(db, 'liveSessions', sessionId), { ...d, 'timestamps.updatedAt': new Date().toISOString() }) } catch {}
  }, [sessionId])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'liveSessions', sessionId), (snap) => {
      if (!snap.exists()) return
      const s = snap.data().moduleState || {}
      if (typeof s.vsDifficulty === 'string') setDifficulty(s.vsDifficulty)
      if (typeof s.vsCurrency === 'string') setCurrency(s.vsCurrency)
      if (typeof s.vsAisle === 'string') setAisle(s.vsAisle)
      if (Array.isArray(s.vsShoppingList)) setShoppingList(s.vsShoppingList as ListItem[])
      if (typeof s.vsWalletAmount === 'number') setWalletAmount(s.vsWalletAmount)
      if (typeof s.vsWalletBalance === 'number') setWalletBalance(s.vsWalletBalance)
      if (Array.isArray(s.vsBasket)) setBasket(s.vsBasket as BasketItem[])
      if (typeof s.vsScore === 'number') setScore(s.vsScore)
      if (typeof s.vsCompleted === 'boolean') setCompleted(s.vsCompleted)
      if (Array.isArray(s.vsPurchaseHistory)) setPurchaseHistory(s.vsPurchaseHistory)
    })
    return () => unsub()
  }, [sessionId])

  useEffect(() => () => { if (toastT.current) clearTimeout(toastT.current); window.speechSynthesis?.cancel() }, [])

  const showToast = useCallback((msg: string) => {
    setToast({ msg })
    if (toastT.current) clearTimeout(toastT.current)
    toastT.current = setTimeout(() => setToast(null), 2000)
  }, [])

  const csym = CURRENCIES[currency] || '₹'

  const filteredItems = useMemo(() => {
    if (aisle === 'all') return SHOP_ITEMS
    return SHOP_ITEMS.filter(i => i.aisle === aisle)
  }, [aisle])

  const basketMap = useMemo(() => {
    const m = new Map<string, BasketItem>()
    for (const b of basket) m.set(b.itemId, b)
    return m
  }, [basket])

  const total = useMemo(() => basket.reduce((s, b) => s + b.price * b.quantity, 0), [basket])
  const itemCount = basket.reduce((s, b) => s + b.quantity, 0)
  const balanceRatio = walletAmount > 0 ? walletBalance / walletAmount : 1
  const balanceColor = balanceRatio > 0.5 ? '#b8d4ce' : balanceRatio > 0.2 ? '#f7c948' : '#c8602a'

  const listItemIds = useMemo(() => new Set(shoppingList.map(l => l.itemId)), [shoppingList])
  const listQuantities = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of shoppingList) m.set(l.itemId, l.quantity)
    return m
  }, [shoppingList])

  const allListItemsInBasket = useMemo(() => {
    for (const l of shoppingList) {
      const b = basketMap.get(l.itemId)
      if (!b || b.quantity < l.quantity) return false
    }
    return shoppingList.length > 0
  }, [shoppingList, basketMap])

  const canPay = basket.length > 0 && total <= walletAmount && (!shoppingList.length || allListItemsInBasket)

  // Maths helper terms
  const mathTerms = useMemo(() => {
    const terms: { label: string; price: number }[] = []
    for (const b of basket) {
      for (let i = 0; i < b.quantity; i++) {
        const item = ITEM_MAP.get(b.itemId)
        terms.push({ label: item?.emoji || b.itemId, price: b.price })
      }
    }
    return terms
  }, [basket])

  const addToBasket = useCallback((itemId: string, clientX: number, clientY: number) => {
    if (!canInteract || completed) return
    const item = ITEM_MAP.get(itemId)
    if (!item) return
    if (walletBalance < item.price) {
      showToast(`Not enough money! Need ${fmtPrice(item.price - walletBalance, currency)} more`)
      return
    }
    const k = ++pk.current
    setFloaters(prev => [...prev, { id: `fl${k}`, x: clientX, y: clientY }])
    setTimeout(() => setFloaters(prev => prev.filter(f => f.id === `fl${k}` ? false : true)), 600)

    const existing = basketMap.get(itemId)
    let newBasket: BasketItem[]
    if (existing) {
      newBasket = basket.map(b => b.itemId === itemId ? { ...b, quantity: b.quantity + 1 } : b)
    } else {
      newBasket = [...basket, { itemId, quantity: 1, price: item.price }]
    }
    const newBalance = walletBalance - item.price
    write({ 'moduleState.vsBasket': newBasket, 'moduleState.vsWalletBalance': newBalance })
  }, [canInteract, completed, walletBalance, currency, basketMap, basket, write, showToast])

  const removeFromBasket = useCallback((itemId: string) => {
    if (!canInteract || completed) return
    const existing = basketMap.get(itemId)
    if (!existing) return
    const item = ITEM_MAP.get(itemId)
    let newBasket: BasketItem[]
    if (existing.quantity > 1) {
      newBasket = basket.map(b => b.itemId === itemId ? { ...b, quantity: b.quantity - 1 } : b)
    } else {
      newBasket = basket.filter(b => b.itemId !== itemId)
    }
    const newBalance = walletBalance + (item?.price || existing.price)
    write({ 'moduleState.vsBasket': newBasket, 'moduleState.vsWalletBalance': newBalance })
  }, [canInteract, completed, basketMap, basket, walletBalance, write])

  const handlePay = useCallback(() => {
    if (!canPay || paying) return
    const change = walletBalance
    setPaying(true)
    setTimeout(() => {
      setPaying(false)
      const rc: Receipt = { items: [...basket], total, paid: walletAmount, change, timestamp: Date.now() }
      setReceipt(rc)
      write({
        'moduleState.vsCompleted': true,
        'moduleState.vsScore': score + 1,
        'moduleState.vsPurchaseHistory': arrayUnion(rc),
      })
      logModuleEvent(sessionId, {
        module: 'virtual-shop',
        type: 'purchase_completed',
        detail: `Bought ${itemCount} item${itemCount === 1 ? '' : 's'} for ${fmtPrice(total, currency)} (difficulty ${difficulty})${shoppingList.length ? ', shopping list complete' : ''}`,
      })
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance('Well done! You bought everything on your list!')
        u.rate = 0.85
        window.speechSynthesis.speak(u)
      }
    }, 700)
  }, [canPay, paying, walletBalance, basket, total, walletAmount, score, write, sessionId, itemCount, currency, difficulty, shoppingList.length])

  const resetShop = useCallback(() => {
    if (!isT && completed) return
    setReceipt(null)
    setPaying(false)
    setBasketOpen(false)
    write({
      'moduleState.vsBasket': [],
      'moduleState.vsWalletBalance': walletAmount,
      'moduleState.vsCompleted': false,
    })
  }, [isT, completed, walletAmount, write])

  const setDifficultyPreset = useCallback((d: string) => {
    const p = DIFFICULTY_MAP[d] || DIFFICULTY_MAP.medium
    setEditList(true)
    write({
      'moduleState.vsDifficulty': d,
      'moduleState.vsWalletAmount': p.wallet,
      'moduleState.vsWalletBalance': p.wallet,
      'moduleState.vsBasket': [],
      'moduleState.vsCompleted': false,
    })
  }, [write])

  const saveShoppingList = useCallback(() => {
    const list: ListItem[] = []
    for (const [itemId, qty] of Object.entries(editQty)) {
      if (qty > 0) list.push({ itemId, quantity: qty })
    }
    write({ 'moduleState.vsShoppingList': list })
    setEditList(false)
  }, [editQty, write])

  const toggleEditItem = useCallback((itemId: string) => {
    setEditQty(prev => {
      if (prev[itemId]) {
        const n = { ...prev }
        delete n[itemId]
        return n
      }
      return { ...prev, [itemId]: 1 }
    })
  }, [])

  const changeEditQty = useCallback((itemId: string, delta: number) => {
    setEditQty(prev => {
      const cur = prev[itemId] || 0
      const next = cur + delta
      if (next <= 0) {
        const n = { ...prev }; delete n[itemId]; return n
      }
      return { ...prev, [itemId]: Math.min(next, 5) }
    })
  }, [])

  return (
    <>
      <style>{`
        @keyframes flUp{0%{transform:translateY(0);opacity:1}100%{transform:translateY(-30px);opacity:0}}
        @keyframes bi{0%{transform:scale(.9)}50%{transform:scale(1.1)}100%{transform:scale(1)}}
        @keyframes payF{0%{transform:translateX(0);opacity:1}100%{transform:translateX(100px);opacity:0}}
        @keyframes receiptUp{0%{transform:translateY(100px);opacity:0}100%{transform:translateY(0);opacity:1}}
      `}</style>

      {/* Therapist controls */}
      {isT && (
        <div style={{ flexShrink: 0, padding: '6px 10px', borderBottom: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: 5, fontSize: 10 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>Difficulty:</span>
            {['easy', 'medium', 'hard'].map(d => (
              <button key={d} onClick={() => setDifficultyPreset(d)}
                style={{
                  padding: '2px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 10, textTransform: 'capitalize',
                  border: difficulty === d ? '1px solid rgba(74,124,111,0.6)' : '1px solid rgba(255,255,255,0.08)',
                  background: difficulty === d ? 'rgba(74,124,111,0.15)' : 'transparent',
                  color: difficulty === d ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)',
                }}
              >{d === 'easy' ? 'Easy ₹50' : d === 'medium' ? 'Medium ₹100' : 'Hard ₹75'}</button>
            ))}
            <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 4 }}>Currency:</span>
            {['rupee', 'dollar', 'pound'].map(c => (
              <button key={c} onClick={() => write({ 'moduleState.vsCurrency': c })}
                style={{
                  padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 10,
                  border: currency === c ? '1px solid rgba(74,124,111,0.6)' : '1px solid rgba(255,255,255,0.08)',
                  background: currency === c ? 'rgba(74,124,111,0.15)' : 'transparent',
                  color: currency === c ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)',
                }}
              >{CURRENCIES[c]}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={() => setEditList(!editList)}
              style={{ padding: '2px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 10, border: '1px solid rgba(255,255,255,0.12)', background: editList ? 'rgba(74,124,111,0.15)' : 'transparent', color: 'rgba(255,255,255,0.6)' }}
            >{editList ? 'Done editing list' : '📋 Edit shopping list'}</button>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>Wallet:</span>
            <input type="number" value={walletAmount} onChange={e => {
              const v = Math.max(10, parseInt(e.target.value) || 10)
              write({ 'moduleState.vsWalletAmount': v, 'moduleState.vsWalletBalance': v })
            }}
              style={{ width: 50, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '2px 6px', color: '#fff', fontSize: 10, outline: 'none' }}
            />
            {basket.length > 0 && (
              <button onClick={resetShop} style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 10, border: '1px solid rgba(200,60,60,0.3)', background: 'transparent', color: 'rgba(200,80,80,0.7)' }}>↺ Reset</button>
            )}
          </div>
          {/* Shopping list editor */}
          {editList && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto', padding: 4, background: 'rgba(0,0,0,0.15)', borderRadius: 6 }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Tap items to add to shopping list</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {SHOP_ITEMS.map(item => {
                  const qty = editQty[item.id] || 0
                  return (
                    <div key={item.id} onClick={() => toggleEditItem(item.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 3, padding: '3px 6px', borderRadius: 6, cursor: 'pointer', fontSize: 10,
                        background: qty > 0 ? 'rgba(74,124,111,0.2)' : 'rgba(255,255,255,0.05)',
                        border: qty > 0 ? '1px solid rgba(74,124,111,0.4)' : '1px solid rgba(255,255,255,0.08)',
                        color: qty > 0 ? '#fff' : 'rgba(255,255,255,0.5)',
                      }}
                    >
                      <span>{item.emoji}</span>
                      <span>{item.name}</span>
                      {qty > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 2 }}>
                          <span onClick={e => { e.stopPropagation(); changeEditQty(item.id, -1) }} style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>−</span>
                          <span style={{ color: '#b8d4ce', fontWeight: 600 }}>{qty}</span>
                          <span onClick={e => { e.stopPropagation(); changeEditQty(item.id, 1) }} style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>+</span>
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              <button onClick={saveShoppingList}
                style={{ padding: '4px 0', borderRadius: 6, border: '1px solid rgba(74,124,111,0.4)', background: 'rgba(74,124,111,0.2)', color: '#b8d4ce', cursor: 'pointer', fontSize: 10 }}
              >Set shopping list ({Object.keys(editQty).length} items)</button>
            </div>
          )}
        </div>
      )}

      {/* Canvas */}
      <div ref={cRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>

        {/* Wallet + List row */}
        <div style={{ display: 'flex', gap: 8, padding: '8px 10px 0', flexShrink: 0 }}>
          {/* Wallet */}
          <div style={{
            width: 130, flexShrink: 0,
            background: 'linear-gradient(135deg,rgba(74,124,111,0.3) 0%,rgba(74,124,111,0.15) 100%)',
            border: '1.5px solid rgba(74,124,111,0.4)', borderRadius: 12, padding: '8px 12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
              <span style={{ fontSize: 16 }}>👛</span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>My Wallet</span>
            </div>
            <div style={{ fontSize: 20, fontFamily: '"DM Serif Display", serif', color: balanceColor, transition: 'color 0.3s' }}>
              {fmtPrice(walletBalance, currency)}
            </div>
          </div>

          {/* Shopping list */}
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '8px 10px', minWidth: 0 }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Shopping List 📋</div>
            {shoppingList.length === 0 ? (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>
                {isT ? 'Set shopping list above' : 'Waiting for shopping list...'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {shoppingList.map(l => {
                  const item = ITEM_MAP.get(l.itemId)
                  if (!item) return null
                  const inBasket = basketMap.get(l.itemId)
                  const fulfilled = inBasket && inBasket.quantity >= l.quantity
                  return (
                    <div key={l.itemId} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: fulfilled ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.85)', textDecoration: fulfilled ? 'line-through' : 'none' }}>
                      <span>{fulfilled ? '☑' : '☐'}</span>
                      <span>{item.emoji}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                      {l.quantity > 1 && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>×{l.quantity}</span>}
                    </div>
                  )
                })}
                {allListItemsInBasket && shoppingList.length > 0 && (
                  <div style={{ fontSize: 9, color: '#b8d4ce', marginTop: 2 }}>Shopping list complete! 🎉</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Maths helper (Easy/Medium) */}
        {difficulty !== 'hard' && mathTerms.length > 0 && (
          <div style={{
            margin: '6px 10px 0', padding: '6px 10px', fontSize: 11, color: 'rgba(255,255,255,0.55)',
            background: 'rgba(255,255,255,0.03)', borderRadius: 8,
            flexShrink: 0,
          }}>
            {mathTerms.map((t, i) => (
              <span key={i}>
                {i > 0 && <span style={{ color: 'rgba(255,255,255,0.25)', margin: '0 2px' }}>+</span>}
                <span>{fmtPrice(t.price, currency)}</span>
              </span>
            ))}
            <span style={{ marginLeft: 4, color: '#b8d4ce' }}>= {fmtPrice(total, currency)}</span>
          </div>
        )}

        {/* Aisle tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '6px 10px 0', flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'thin' }}>
          {AISLES.map(a => (
            <button key={a.id} onClick={() => { if (isT) write({ 'moduleState.vsAisle': a.id }); else setAisle(a.id) }}
              style={{
                whiteSpace: 'nowrap', padding: '3px 10px', borderRadius: 10, cursor: 'pointer', fontSize: 10,
                border: aisle === a.id ? '1px solid rgba(74,124,111,0.5)' : '1px solid rgba(255,255,255,0.08)',
                background: aisle === a.id ? 'rgba(74,124,111,0.15)' : 'transparent',
                color: aisle === a.id ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)',
              }}
            >{a.emoji} {a.label}</button>
          ))}
        </div>

        {/* Shop grid */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '6px 10px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
            {filteredItems.map(item => {
              const inBasket = basketMap.get(item.id)
              const qty = inBasket?.quantity || 0
              const onList = listItemIds.has(item.id) || editQty[item.id] > 0
              return (
                <div key={item.id}
                  onClick={e => {
                    const r = (e.target as HTMLElement).getBoundingClientRect()
                    addToBasket(item.id, r.left + r.width / 2, r.top)
                  }}
                  style={{
                    borderRadius: 10, padding: '6px 4px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: canInteract && !completed ? 'pointer' : 'default',
                    transition: 'all 0.15s', position: 'relative',
                    background: onList ? 'rgba(255,200,50,0.06)' : 'rgba(255,255,255,0.06)',
                    border: onList ? '1px solid rgba(255,200,50,0.3)' : '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  {onList && <span style={{ position: 'absolute', top: 2, right: 4, fontSize: 8 }}>📋</span>}
                  {qty > 0 && (
                    <span style={{
                      position: 'absolute', top: -4, right: -4, background: '#4a7c6f', color: '#fff', fontSize: 8,
                      borderRadius: 8, padding: '1px 5px', fontWeight: 600, zIndex: 2,
                    }}>
                      {qty}
                    </span>
                  )}
                  <span style={{ fontSize: 22, lineHeight: 1 }}>{item.emoji}</span>
                  <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: 1.1 }}>{item.name}</span>
                  <span style={{ fontSize: 9, fontWeight: 600, color: walletBalance >= item.price ? '#b8d4ce' : '#c8602a' }}>
                    {fmtPrice(item.price, currency)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Basket */}
        <div style={{ flexShrink: 0, borderTop: '1px solid var(--glass-border)' }}>
          <div onClick={() => setBasketOpen(!basketOpen)}
            style={{
              padding: '8px 12px', cursor: 'pointer',
              background: basketOpen ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'rgba(255,255,255,0.6)',
            }}
          >
            <span>🛒 Basket ({itemCount} item{itemCount !== 1 ? 's' : ''})</span>
            <span>{basketOpen ? '▲' : '▼'}</span>
          </div>
          {basketOpen && (
            <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.1)' }}>
              {basket.length === 0 ? (
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>Basket is empty</div>
              ) : (
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 6 }}>
                  {basket.map(b => {
                    const item = ITEM_MAP.get(b.itemId)
                    if (!item) return null
                    return (
                      <div key={b.itemId} onClick={() => removeFromBasket(b.itemId)}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: canInteract ? 'pointer' : 'default',
                          padding: '6px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                          fontSize: 10, whiteSpace: 'nowrap', flexShrink: 0,
                        }}
                      >
                        <span style={{ fontSize: 18 }}>{item.emoji}</span>
                        <span style={{ color: 'rgba(255,255,255,0.5)' }}>×{b.quantity}</span>
                        <span style={{ color: '#b8d4ce' }}>{fmtPrice(b.price * b.quantity, currency)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: total > walletAmount ? '#c8602a' : '#b8d4ce', fontWeight: 600 }}>
                  Total: {fmtPrice(total, currency)}
                </span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                  Left: {fmtPrice(walletBalance, currency)}
                </span>
              </div>
              {difficulty === 'hard' && (
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>
                  Change: {fmtPrice(walletBalance, currency)}
                </div>
              )}
              {!completed && (
                <button onClick={handlePay} disabled={!canPay || paying}
                  style={{
                    width: '100%', height: 40, borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: canPay && !paying ? 'pointer' : 'default',
                    background: canPay && !paying ? 'rgba(74,124,111,0.3)' : 'rgba(255,255,255,0.04)',
                    border: canPay && !paying ? '1.5px solid rgba(74,124,111,0.5)' : '1px solid rgba(255,255,255,0.08)',
                    color: canPay && !paying ? '#b8d4ce' : 'rgba(255,255,255,0.25)', opacity: canPay && !paying ? 1 : 0.4,
                  }}
                >Pay now 💳</button>
              )}
            </div>
          )}
        </div>

        {/* Floaters */}
        {floaters.map(f => (
          <div key={f.id} style={{
            position: 'absolute', left: f.x - 12, top: f.y - 16, fontSize: 14, pointerEvents: 'none', zIndex: 30,
            animation: 'flUp 0.5s ease forwards', color: '#b8d4ce',
          }}>
            +1 🛒
          </div>
        ))}

        {/* Pay animation */}
        {paying && (
          <div style={{
            position: 'absolute', left: '40%', top: '40%', fontSize: 40, zIndex: 40, pointerEvents: 'none',
            animation: 'payF 0.6s ease forwards',
          }}>
            💳➡️🏪
          </div>
        )}

        {/* Receipt */}
        {receipt && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 50, padding: 20,
          }}>
            <div style={{
              background: 'rgba(255,255,240,0.1)', border: '1px solid rgba(255,255,200,0.2)', borderRadius: 8,
              padding: 16, width: '100%', maxWidth: 280, animation: 'receiptUp 0.4s ease',
            }}>
              <div style={{ fontFamily: '"DM Serif Display", serif', fontSize: 14, color: '#fff', textAlign: 'center', marginBottom: 8 }}>🏪 Staad Store</div>
              <div style={{ borderTop: '1px dashed rgba(255,255,255,0.15)', marginBottom: 8 }} />
              {receipt.items.map(b => {
                const item = ITEM_MAP.get(b.itemId)
                return (
                  <div key={b.itemId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.7)', marginBottom: 3 }}>
                    <span>{item?.emoji} {item?.name} ×{b.quantity}</span>
                    <span>{fmtPrice(b.price * b.quantity, currency)}</span>
                  </div>
                )
              })}
              <div style={{ borderTop: '1px dashed rgba(255,255,255,0.15)', margin: '6px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#fff', fontWeight: 600 }}>
                <span>Total</span><span>{fmtPrice(receipt.total, currency)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
                <span>Paid</span><span>{fmtPrice(receipt.paid, currency)}</span>
              </div>
              {difficulty === 'hard' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
                  <span>Change</span><span>{fmtPrice(receipt.change, currency)}</span>
                </div>
              )}
              <div style={{ borderTop: '1px dashed rgba(255,255,255,0.15)', margin: '6px 0' }} />
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>Thank you! 😊</div>
              <button onClick={resetShop}
                style={{ marginTop: 8, width: '100%', padding: '6px 0', borderRadius: 6, border: '1px solid rgba(74,124,111,0.4)', background: 'rgba(74,124,111,0.2)', color: '#b8d4ce', cursor: 'pointer', fontSize: 11 }}
              >Shop again</button>
            </div>
          </div>
        )}

        {/* Completion info on receipt closed */}
        {completed && !receipt && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: 'rgba(74,124,111,0.15)', backdropFilter: 'blur(4px)', zIndex: 45, padding: 20,
          }}>
            <div style={{ fontSize: 32 }}>🎉</div>
            <div style={{ fontSize: 14, color: '#fff', textAlign: 'center' }}>Shopping complete!</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Score: {score}</div>
            <button onClick={resetShop}
              style={{ padding: '6px 20px', borderRadius: 6, border: '1px solid rgba(74,124,111,0.4)', background: 'rgba(74,124,111,0.2)', color: '#b8d4ce', cursor: 'pointer', fontSize: 11 }}
            >Shop again</button>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', borderRadius: 10,
          padding: '8px 16px', color: '#fff', fontSize: 13, zIndex: 100, pointerEvents: 'none',
        }}>
          {toast.msg}
        </div>
      )}
    </>
  )
}
