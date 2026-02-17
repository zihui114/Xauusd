from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # 關聯
    sessions = db.relationship('ReplaySession', backref='user', lazy=True)
    trades = db.relationship('Trade', backref='user', lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'created_at': self.created_at.isoformat()
        }


class ReplaySession(db.Model):
    """復盤記錄"""
    __tablename__ = 'replay_sessions'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    name = db.Column(db.String(200), nullable=True)  # 復盤名稱
    start_date = db.Column(db.String(20), nullable=False)  # 開始日期
    timeframe = db.Column(db.String(10), nullable=False)  # 時間週期
    initial_balance = db.Column(db.Float, default=10000)
    final_balance = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 關聯
    trades = db.relationship('Trade', backref='session', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'start_date': self.start_date,
            'timeframe': self.timeframe,
            'initial_balance': self.initial_balance,
            'final_balance': self.final_balance,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'trade_count': len(self.trades)
        }


class Trade(db.Model):
    """交易記錄"""
    __tablename__ = 'trades'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    session_id = db.Column(db.Integer, db.ForeignKey('replay_sessions.id'), nullable=True)

    trade_type = db.Column(db.String(10), nullable=False)  # 'buy' or 'sell'
    lot_size = db.Column(db.Float, nullable=False)
    entry_price = db.Column(db.Float, nullable=False)
    close_price = db.Column(db.Float, nullable=True)
    stop_loss = db.Column(db.Float, nullable=True)
    take_profit = db.Column(db.Float, nullable=True)
    pnl = db.Column(db.Float, nullable=True)
    status = db.Column(db.String(20), nullable=False)  # 'open', 'closed', 'cancelled'
    close_reason = db.Column(db.String(50), nullable=True)  # '止損', '止盈', '手動平倉'

    open_time = db.Column(db.DateTime, nullable=True)
    close_time = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'trade_type': self.trade_type,
            'lot_size': self.lot_size,
            'entry_price': self.entry_price,
            'close_price': self.close_price,
            'stop_loss': self.stop_loss,
            'take_profit': self.take_profit,
            'pnl': self.pnl,
            'status': self.status,
            'close_reason': self.close_reason,
            'open_time': self.open_time.isoformat() if self.open_time else None,
            'close_time': self.close_time.isoformat() if self.close_time else None,
            'created_at': self.created_at.isoformat()
        }
