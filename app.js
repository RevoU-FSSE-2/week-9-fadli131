const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const redis = require('redis');
require('dotenv').config();

const app = express();
const port = 3000;

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'week9'
});

db.connect((err) =>{
    if(err){
        console.log('Error connecting to the DB' + err);
        return;
    }

    console.log('connected')
});

const connection = mysql.createConnection({
    host: 'localhost', 
    user: 'root', 
    password: '',
    database: 'week9' 
});

const query = (query, values) => {
    return new Promise((resolve, reject) => {
        mysqlCon.query(query, values, (err, result, fields) => {
            if (err) {
                reject(err)
            } else {
                resolve(result)
            }
        });
    });
}

const redisClient = redis.createClient();

app.use(bodyParser.json());

app.get('/karyawan', (request, response) => {
    mysqlCon.query("select * from week9.karyawan", (err, result, fields) => {
        if (err) {
            console.error(err)
            response.status(500).json(commonResponse(null, "server error"))
            response.end()
            return
        }

        response.status(200).json(commonResponse(result, null))
        response.end()
    })
})

app.get('/karyawan/:id', async (request, response) => {
    try {
        const id = request.params.id
        const userKey = "user:" + id
        const cacheData = await redisCon.hgetall(userKey)

        if (Object.keys(cacheData).length !== 0) {
            console.log("get data from cache")
            response.status(200).json(commonResponse(cacheData, null))
            response.end()
            return
        }

        const dbData = await query(`select
                p.id,
                p.name,
                p.address,
                sum(o.price) as amount
            from
                revou.person as p
                left join week9.karyawan as o on p.id = o.karyawan_id
            where
                p.id = ?
            group by
                p.id`, id)

        await redisCon.hset(userKey, dbData[0])
        await redisCon.expire(userKey, 20);

        response.status(200).json(commonResponse(dbData[0], null))
        response.end()
    } catch (err) {
        console.error(err)
        response.status(500).json(commonResponse(null, "server error"))
        response.end()
        return
    }

})

app.post('/karyawan', (request, response) => {

})

app.post('/transaksi', async (request, response) => {
    try {
        const body = request.body

        const dbData = await query(`insert into
            week9.karyawan (karyawan_id, type, product)
        values
        (?, ?, ?)`, [body.user_id, body.price, body.product])

        const userId = body.user_id
        const userKey = "user:" + userId
        await redisCon.del(userKey)

        response.status(200).json(commonResponse({
            id: dbData.insertId
        }, null))
        response.end()

    } catch (err) {
        console.error(err)
        response.status(500).json(commonResponse(null, "server error"))
        response.end()
        return
    }
})

app.delete('/transaksi/:id', async (request, response) => {
    try {
        const id = request.params.id
        const data = await query("select karyawan_id from revou.order where id = ?", id)
        if (Object.keys(data).length === 0) {
            response.status(404).json(commonResponse(null, "data not found"))
            response.end()
            return
        }
        const karyawanId = data[0].karyawan_id
        const userKey = "user:" + karyawanId
        await query("delete from week9.karyawan where id = ?", id)
        await redisCon.del(userKey)

        response.status(200).json(commonResponse({
            id: id
        }))

        response.end()

    } catch (err) {
        console.error(err)
        response.status(500).json(commonResponse(null, "server error"))
        response.end()
        return
    }
})

app.listen(port, () => {
    console.log(`Server berjalan di 
  http://localhost/
  :${port}`);
  }); 

