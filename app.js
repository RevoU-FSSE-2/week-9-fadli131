const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const redis = require('redis');
const redisClient = redis.createClient();
require('dotenv').config();

const app = express();
const port = 3003;

app.use(bodyParser.json());

const db = mysql.createConnection({
    host: 'containers-us-west-194.railway.app',
    port: '7564',
    user: 'root',
    password: '73HcEVAGlBkbr78Wiy0y',
    database: 'railway'
});

db.connect((err) => {
    if (err) {
        console.log('Error connecting to the DB' + err);
        return;
    }
    console.log('Connected to the database');
});

redisClient.on('error', (err) => {
    console.error('Error connecting to Redis:', err);
});

redisClient.on('connect', () => {
    console.log('Connected to Redis');
});

const query = (query, values) => {
    return new Promise((resolve, reject) => {
        db.query(query, values, (err, result, fields) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
};

const commonResponse = (data, errorMessage) => {
    return {
        data: data,
        error: errorMessage
    };
};

app.get('/karyawan', (request, response) => {
    db.query("select * from karyawan", (err, result, fields) => {
        if (err) {
            console.error(err);
            response.status(500).json(commonResponse(null, "server error"));
            return;
        }
        response.status(200).json(commonResponse(result, null));
    });
});

app.get('/karyawan/:id', async (request, response) => {
    try {
        const id = request.params.id;

        const queryResult = await query(`
        SELECT u.id, u.name, u.address,
            (SELECT SUM(t.amount) - (SELECT SUM(t.amount)
                FROM transaksi t
                WHERE t.type = "expense" AND t.user_id = ?)
            FROM transaksi t
            WHERE t.type = "income" AND t.user_id = ?) AS balance,
            (SELECT SUM(t.amount)
                FROM transaksi t
                WHERE t.type = "expense" AND t.user_id = ?) AS expense
        FROM karyawan AS u
        WHERE u.id = ?
        GROUP BY u.id`, [id, id, id, id]);

        if (queryResult.length > 0) {
            console.log("Transaksi Connected", queryResult);
            response.status(200).json(commonResponse(queryResult[0], null));
        } else {
            response.status(404).json(commonResponse(null, "karyawan ID is not found"));
        }
    } catch (err) {
        console.error(err);
        response.status(500).json(commonResponse(null, "server error"));
    }
});

app.post('/transaksi', async (request, response) => {
    const body = request.body

    db.query(`
    insert into
    transaksi (user_id, type, amount)
    values(?, ?, ?)`,
        [body.user_id, body.type, body.amount], (err, result, fields) => {
            if (err) {
                console.error(err)
                response.status(500).json(commonResponse(null, "Server error"))
                response.end
                return
            }
            response.status(200).json(commonResponse({ id: result.insertId }, null))
            response.end
        })
})

app.put('/transaksi/:id', (request, response) => {
    const id = request.params.id;
    const { type, amount, user_id } = request.body;

    db.query(
        `UPDATE transaksi
        SET user_id=?, type=?, amount=?
        WHERE id=?`, [user_id, type, amount, id],
        (err, result, fields) => {
            if (err) {
                console.error(err);
                response.status(500).json(commonResponse(null, "Server error"));
                return;
            }
            console.log("Transaction updated", result);
            response.status(200).json(commonResponse({ id: id }, null));
        }
    );
});

app.delete('/transaksi/:id', async (request, response) => {
    try {
        const id = request.params.id;
        const transaksiData = await query("SELECT * FROM transaksi WHERE id = ?", [id]);

        if (transaksiData && transaksiData.length === 0) {
            response.status(404).json(commonResponse(null, "Transaksi data not found"));
            return;
        }

        await query("DELETE FROM transaksi WHERE id = ?", [id]);
        
        const transaksiId = transaksiData[0].id; 
        const userKey = "user:" + transaksiId; 
        redisClient.del(userKey);

        response.status(200).json(commonResponse({
            id: id
        }));

    } catch (err) {
        console.error(err);
        response.status(500).json(commonResponse(null, "server error"));
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});