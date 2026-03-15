from pymongo import MongoClient
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from bson import ObjectId

# MongoDB 連線 - 請將 <db_password> 替換成你的密碼
MONGODB_URI = "mongodb+srv://zzkk:akira@cluster0.2obocxv.mongodb.net/?appName=Cluster0"

# 連接 MongoDB
client = MongoClient(MONGODB_URI)
db = client.xauusd  # 資料庫名稱

# 集合（相當於 SQL 的表）
users = db.users
sessions = db.replay_sessions
trades = db.trades


class User:
    """用戶模型"""

    @staticmethod
    def create(username, password):
        """創建新用戶"""
        user = {
            'username': username,
            'password_hash': generate_password_hash(password),
            'created_at': datetime.utcnow()
        }
        result = users.insert_one(user)
        user['_id'] = result.inserted_id
        return user

    @staticmethod
    def find_by_username(username):
        """通過用戶名查找用戶"""
        return users.find_one({'username': username})

    @staticmethod
    def find_by_id(user_id):
        """通過 ID 查找用戶"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        return users.find_one({'_id': user_id})

    @staticmethod
    def check_password(user, password):
        """驗證密碼"""
        return check_password_hash(user['password_hash'], password)

    @staticmethod
    def to_dict(user):
        """轉換為字典格式"""
        if not user:
            return None
        return {
            'id': str(user['_id']),
            'username': user['username'],
            'created_at': user['created_at'].isoformat()
        }


class ReplaySession:
    """復盤記錄模型"""

    @staticmethod
    def create(user_id, name, start_date, timeframe, initial_balance):
        """創建新復盤記錄"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        session = {
            'user_id': user_id,
            'name': name,
            'start_date': start_date,
            'timeframe': timeframe,
            'initial_balance': initial_balance,
            'final_balance': None,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        result = sessions.insert_one(session)
        session['_id'] = result.inserted_id
        return session

    @staticmethod
    def find_by_user(user_id):
        """查找用戶的所有復盤記錄"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        return list(sessions.find({'user_id': user_id}).sort('updated_at', -1))

    @staticmethod
    def find_by_id(session_id, user_id=None):
        """查找單個復盤記錄"""
        if isinstance(session_id, str):
            session_id = ObjectId(session_id)
        if user_id and isinstance(user_id, str):
            user_id = ObjectId(user_id)

        query = {'_id': session_id}
        if user_id:
            query['user_id'] = user_id
        return sessions.find_one(query)

    @staticmethod
    def update(session_id, user_id, updates):
        """更新復盤記錄"""
        if isinstance(session_id, str):
            session_id = ObjectId(session_id)
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        updates['updated_at'] = datetime.utcnow()
        sessions.update_one(
            {'_id': session_id, 'user_id': user_id},
            {'$set': updates}
        )
        return ReplaySession.find_by_id(session_id, user_id)

    @staticmethod
    def delete(session_id, user_id):
        """刪除復盤記錄"""
        if isinstance(session_id, str):
            session_id = ObjectId(session_id)
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        # 先刪除相關交易記錄
        trades.delete_many({'session_id': session_id})
        # 再刪除復盤記錄
        sessions.delete_one({'_id': session_id, 'user_id': user_id})

    @staticmethod
    def to_dict(session):
        """轉換為字典格式"""
        if not session:
            return None

        # 計算交易數量
        trade_count = trades.count_documents({'session_id': session['_id']})

        return {
            'id': str(session['_id']),
            'name': session['name'],
            'start_date': session['start_date'],
            'timeframe': session['timeframe'],
            'initial_balance': session['initial_balance'],
            'final_balance': session.get('final_balance'),
            'created_at': session['created_at'].isoformat(),
            'updated_at': session['updated_at'].isoformat(),
            'trade_count': trade_count
        }


class Trade:
    """交易記錄模型"""

    @staticmethod
    def create(user_id, session_id, trade_data):
        """創建新交易記錄"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        if session_id and isinstance(session_id, str):
            session_id = ObjectId(session_id)

        trade = {
            'user_id': user_id,
            'session_id': session_id,
            'trade_type': trade_data.get('trade_type'),
            'lot_size': trade_data.get('lot_size'),
            'entry_price': trade_data.get('entry_price'),
            'close_price': trade_data.get('close_price'),
            'stop_loss': trade_data.get('stop_loss'),
            'take_profit': trade_data.get('take_profit'),
            'pnl': trade_data.get('pnl'),
            'status': trade_data.get('status', 'open'),
            'close_reason': trade_data.get('close_reason'),
            'open_time': trade_data.get('open_time'),
            'close_time': trade_data.get('close_time'),
            'created_at': datetime.utcnow()
        }
        result = trades.insert_one(trade)
        trade['_id'] = result.inserted_id
        return trade

    @staticmethod
    def find_by_user(user_id, session_id=None):
        """查找用戶的交易記錄"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        query = {'user_id': user_id}
        if session_id:
            if isinstance(session_id, str):
                session_id = ObjectId(session_id)
            query['session_id'] = session_id

        return list(trades.find(query).sort('created_at', -1))

    @staticmethod
    def find_by_session(session_id):
        """查找復盤記錄的所有交易"""
        if isinstance(session_id, str):
            session_id = ObjectId(session_id)
        return list(trades.find({'session_id': session_id}).sort('created_at', -1))

    @staticmethod
    def to_dict(trade):
        """轉換為字典格式"""
        if not trade:
            return None

        return {
            'id': str(trade['_id']),
            'session_id': str(trade['session_id']) if trade.get('session_id') else None,
            'trade_type': trade.get('trade_type'),
            'lot_size': trade.get('lot_size'),
            'entry_price': trade.get('entry_price'),
            'close_price': trade.get('close_price'),
            'stop_loss': trade.get('stop_loss'),
            'take_profit': trade.get('take_profit'),
            'pnl': trade.get('pnl'),
            'status': trade.get('status'),
            'close_reason': trade.get('close_reason'),
            'open_time': trade.get('open_time'),
            'close_time': trade.get('close_time'),
            'created_at': trade['created_at'].isoformat()
        }
