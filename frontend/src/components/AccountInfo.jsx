import './AccountInfo.css';

function AccountInfo({ balance, profit }) {
  const netWorth = balance + profit;
  
  return (
    <div className="account-info">
      <h4>帳戶總覽</h4>
      
      <div className="info-grid">
        <div className="info-item">
          <span className="info-label">餘額</span>
          <span className="info-value">${balance.toFixed(2)}</span>
        </div>
        
        <div className="info-item">
          <span className="info-label">浮盈</span>
          <span className={`info-value ${profit >= 0 ? 'positive' : 'negative'}`}>
            {profit >= 0 ? '+' : ''}{profit.toFixed(2)}
          </span>
        </div>
        
        <div className="info-item highlight">
          <span className="info-label">淨值</span>
          <span className="info-value">${netWorth.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

export default AccountInfo;