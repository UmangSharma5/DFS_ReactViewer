import express from 'express'
import { execSql } from '../db.js'

const map_user_to_bucket = async (user,bucket) => {
    let query = `INSERT INTO User_Bucket VALUES ('${user}','${bucket}');`
    const res = await execSql(query)
    return res
}
const get_user_bucket = async (user) => {
    let query = `SELECT bucket_name FROM User_Bucket where user = '${user}';`
    return await execSql(query).then(res => res[0]?.bucket_name)
}
const remove_user_bucket = async (user) => {
    let query = `DELETE FROM User_Bucket where user = '${user}';`
    return await execSql(query)
}

export {
    map_user_to_bucket,
    get_user_bucket,
    remove_user_bucket
}