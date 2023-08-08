import sql from 'mysql2'

const connectionParams = {
  // host: process.env.SQL_HOST,
  host: '127.0.0.1',
  user: process.env.SQL_USER,
  database: process.env.SQL_DATABASE
}

const pool = process.env.USER === 'root' ?
  sql.createPool({...connectionParams, user: 'root'}) :
  sql.createPool({password: process.env.SQL_PASSWORD, ...connectionParams});

function execSql(statement, values) {
  return new Promise(function (res, rej) {
    pool.getConnection((err, con) => {
      if(err) rej(err);
      console.log("Connected to database");
      con.query(statement, values, function (err, result) {
        con.release();
        if (err) rej(err);
        else res(result);
      });
    })
  });
}

export {execSql}