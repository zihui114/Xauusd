import { useState, useRef, useEffect } from 'react';
import './TradingPanel.css';

function TradingPanel({
  balance,
  positions,
  onAddPosition,
  onUpdatePosition,
  onClosePosition,
  currentPrice,
  isVisible,
  onClose
}) {
  const [position, setPosition] = useState({ x: 50, y: 400 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [lotSize, setLotSize] = useState(0.01);
  const [editingCell, setEditingCell] = useState(null); // { positionId, field }
  const [editValue, setEditValue] = useState('');
  const [closingPosition, setClosingPosition] = useState(null); // 正在平倉的訂單
  const [closeLotSize, setCloseLotSize] = useState(''); // 要平的手數
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const closeInputRef = useRef(null);

  // 開始拖曳
  const handleMouseDown = (e) => {
    if (e.target.closest('.panel-close-btn') || e.target.closest('input') || e.target.closest('button') || e.target.closest('select')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  // 拖曳中
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // 聚焦編輯輸入框
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  // 聚焦平倉輸入框
  useEffect(() => {
    if (closingPosition && closeInputRef.current) {
      closeInputRef.current.focus();
      closeInputRef.current.select();
    }
  }, [closingPosition]);

  // 快速下單
  const quickOrder = (type) => {
    const newPosition = {
      id: Date.now(),
      type: type,
      entryPrice: currentPrice,
      stopLoss: null,
      takeProfit: null,
      lotSize: lotSize,
      openTime: new Date().toISOString(),
      status: 'open', // 'open' 或 'pending'
    };

    if (onAddPosition) {
      onAddPosition(newPosition);
    }
  };

  // 開始編輯
  const startEdit = (positionId, field, currentValue) => {
    setEditingCell({ positionId, field });
    setEditValue(currentValue ? currentValue.toString() : '');
  };

  // 確認編輯
  const confirmEdit = () => {
    if (!editingCell) return;

    const { positionId, field } = editingCell;
    const pos = positions.find(p => p.id === positionId);
    if (!pos) {
      setEditingCell(null);
      return;
    }

    let newValue = editValue === '' ? null : parseFloat(editValue);
    if (editValue !== '' && isNaN(newValue)) {
      setEditingCell(null);
      return;
    }

    // 更新持倉
    const updates = { [field]: newValue };

    // 檢查是否變成預掛單（開倉價≠現價）
    if (field === 'entryPrice' && newValue !== null) {
      updates.status = Math.abs(newValue - currentPrice) > 0.01 ? 'pending' : 'open';
    }

    if (onUpdatePosition) {
      onUpdatePosition(positionId, updates);
    }

    setEditingCell(null);
  };

  // 取消編輯
  const cancelEdit = () => {
    setEditingCell(null);
  };

  // 鍵盤處理
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      confirmEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  // 計算單筆盈虧
  const calculatePnL = (pos) => {
    if (pos.status === 'pending') return 0;
    const priceDiff = pos.type === 'buy'
      ? currentPrice - pos.entryPrice
      : pos.entryPrice - currentPrice;
    return priceDiff * pos.lotSize * 100;
  };

  // 計算預估虧損（風險）
  const calculateRisk = (pos) => {
    if (!pos.stopLoss) return null;
    const priceDiff = pos.type === 'buy'
      ? pos.entryPrice - pos.stopLoss
      : pos.stopLoss - pos.entryPrice;
    return priceDiff * pos.lotSize * 100;
  };

  // 開始平倉（顯示輸入框）
  const startClose = (pos) => {
    setClosingPosition(pos);
    setCloseLotSize(pos.lotSize.toString());
  };

  // 確認平倉
  const confirmClose = () => {
    if (!closingPosition) return;

    const closeAmount = parseFloat(closeLotSize);
    if (isNaN(closeAmount) || closeAmount <= 0) {
      setClosingPosition(null);
      return;
    }

    // 計算這次平倉的盈虧
    const priceDiff = closingPosition.type === 'buy'
      ? currentPrice - closingPosition.entryPrice
      : closingPosition.entryPrice - currentPrice;
    const pnl = priceDiff * closeAmount * 100;

    if (closeAmount >= closingPosition.lotSize) {
      // 全部平倉
      onClosePosition(closingPosition.id, closingPosition.lotSize, pnl);
    } else {
      // 部分平倉：減少手數
      onClosePosition(closingPosition.id, closeAmount, pnl);
    }

    setClosingPosition(null);
    setCloseLotSize('');
  };

  // 取消平倉
  const cancelClose = () => {
    setClosingPosition(null);
    setCloseLotSize('');
  };

  // 平倉鍵盤處理
  const handleCloseKeyDown = (e) => {
    if (e.key === 'Enter') {
      confirmClose();
    } else if (e.key === 'Escape') {
      cancelClose();
    }
  };

  // 計算總浮動盈虧
  const totalPnL = positions.reduce((sum, pos) => sum + calculatePnL(pos), 0);

  if (!isVisible) return null;

  return (
    <div
      className="trading-panel-horizontal"
      ref={panelRef}
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      {/* 標題列 - 快速下單區 */}
      <div
        className="panel-header"
        onMouseDown={handleMouseDown}
      >
        <div className="header-left">
          <span className="panel-title">交易面板</span>
        </div>
        <div className="quick-order-section">
          <div className="lot-input-group">
            <label>手數:</label>
            <select
              value={lotSize}
              onChange={(e) => setLotSize(parseFloat(e.target.value))}
              className="lot-select"
            >
              <option value={0.01}>0.01</option>
              <option value={0.02}>0.02</option>
              <option value={0.05}>0.05</option>
              <option value={0.1}>0.1</option>
              <option value={0.2}>0.2</option>
              <option value={0.5}>0.5</option>
              <option value={1}>1.0</option>
            </select>
          </div>
          <button className="quick-btn buy" onClick={() => quickOrder('buy')}>
            買入
          </button>
          <button className="quick-btn sell" onClick={() => quickOrder('sell')}>
            賣出
          </button>
          <div className="current-price-display">
            現價: <strong>{currentPrice.toFixed(2)}</strong>
          </div>
        </div>
        <button className="panel-close-btn" onClick={onClose}>×</button>
      </div>

      {/* 持倉表格 */}
      <div className="positions-table-container">
        <table className="positions-table">
          <thead>
            <tr>
              <th>狀態</th>
              <th>開倉時間</th>
              <th>類別</th>
              <th>手數</th>
              <th>開倉價</th>
              <th>止損</th>
              <th>止盈</th>
              <th>現價</th>
              <th>獲利</th>
              <th>預估風險</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <tr className="empty-row">
                <td colSpan="11">點擊上方「買入」或「賣出」建立新訂單</td>
              </tr>
            ) : (
              positions.map(pos => {
                const pnl = calculatePnL(pos);
                const risk = calculateRisk(pos);
                const openTime = new Date(pos.openTime).toLocaleString('zh-TW', {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <tr key={pos.id} className={`${pos.type} ${pos.status === 'pending' ? 'pending' : ''}`}>
                    <td>
                      <span className={`status-badge ${pos.status}`}>
                        {pos.status === 'pending' ? '預掛' : '持倉'}
                      </span>
                    </td>
                    <td className="time-cell">{openTime}</td>
                    <td>
                      <span className={`type-badge ${pos.type}`}>
                        {pos.type === 'buy' ? 'BUY' : 'SELL'}
                      </span>
                    </td>
                    <td>{pos.lotSize}</td>

                    {/* 開倉價 - 可編輯 */}
                    <td
                      className="editable-cell"
                      onClick={() => startEdit(pos.id, 'entryPrice', pos.entryPrice)}
                    >
                      {editingCell?.positionId === pos.id && editingCell?.field === 'entryPrice' ? (
                        <input
                          ref={inputRef}
                          type="number"
                          step="0.01"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={confirmEdit}
                          onKeyDown={handleKeyDown}
                          className="inline-edit-input"
                        />
                      ) : (
                        <span className="editable-value">{pos.entryPrice.toFixed(2)}</span>
                      )}
                    </td>

                    {/* 止損 - 可編輯 */}
                    <td
                      className="editable-cell sl-cell"
                      onClick={() => startEdit(pos.id, 'stopLoss', pos.stopLoss)}
                    >
                      {editingCell?.positionId === pos.id && editingCell?.field === 'stopLoss' ? (
                        <input
                          ref={inputRef}
                          type="number"
                          step="0.01"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={confirmEdit}
                          onKeyDown={handleKeyDown}
                          className="inline-edit-input"
                        />
                      ) : (
                        <span className="editable-value">{pos.stopLoss ? pos.stopLoss.toFixed(2) : '點擊設定'}</span>
                      )}
                    </td>

                    {/* 止盈 - 可編輯 */}
                    <td
                      className="editable-cell tp-cell"
                      onClick={() => startEdit(pos.id, 'takeProfit', pos.takeProfit)}
                    >
                      {editingCell?.positionId === pos.id && editingCell?.field === 'takeProfit' ? (
                        <input
                          ref={inputRef}
                          type="number"
                          step="0.01"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={confirmEdit}
                          onKeyDown={handleKeyDown}
                          className="inline-edit-input"
                        />
                      ) : (
                        <span className="editable-value">{pos.takeProfit ? pos.takeProfit.toFixed(2) : '點擊設定'}</span>
                      )}
                    </td>

                    <td className="price-cell">{currentPrice.toFixed(2)}</td>

                    <td className={`pnl-cell ${pnl >= 0 ? 'positive' : 'negative'}`}>
                      {pos.status === 'pending' ? '-' : `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`}
                    </td>

                    <td className={`risk-cell ${risk !== null ? 'negative' : ''}`}>
                      {risk !== null ? `-${risk.toFixed(2)}` : '-'}
                    </td>

                    <td className="action-cell">
                      {pos.status === 'pending' ? (
                        <button
                          className="close-pos-btn cancel"
                          onClick={() => onClosePosition(pos.id, pos.lotSize, 0)}
                        >
                          取消
                        </button>
                      ) : closingPosition?.id === pos.id ? (
                        <div className="close-input-group">
                          <input
                            ref={closeInputRef}
                            type="number"
                            step="0.01"
                            min="0.01"
                            max={pos.lotSize}
                            value={closeLotSize}
                            onChange={(e) => setCloseLotSize(e.target.value)}
                            onKeyDown={handleCloseKeyDown}
                            className="close-lot-input"
                            placeholder="手數"
                          />
                          <button className="close-confirm-btn" onClick={confirmClose}>✓</button>
                          <button className="close-cancel-btn" onClick={cancelClose}>✕</button>
                        </div>
                      ) : (
                        <button
                          className="close-pos-btn"
                          onClick={() => startClose(pos)}
                        >
                          平倉
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 帳戶資訊 - 底部 */}
      <div className="account-footer">
        <div className="account-item">
          <span className="label">餘額:</span>
          <span className="value">${balance.toFixed(2)}</span>
        </div>
        <div className="account-item">
          <span className="label">浮動盈虧:</span>
          <span className={`value ${totalPnL >= 0 ? 'positive' : 'negative'}`}>
            {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)}
          </span>
        </div>
        <div className="account-item">
          <span className="label">淨值:</span>
          <span className="value">${(balance + totalPnL).toFixed(2)}</span>
        </div>
        <div className="account-item">
          <span className="label">持倉數:</span>
          <span className="value">{positions.filter(p => p.status === 'open').length}</span>
        </div>
        <div className="account-item">
          <span className="label">預掛單:</span>
          <span className="value">{positions.filter(p => p.status === 'pending').length}</span>
        </div>
      </div>
    </div>
  );
}

export default TradingPanel;
