import dotenv from 'dotenv'
dotenv.config()
import axios from 'axios';

const require_auth = async (req,res,next) =>{
    if(!req.headers.authorization){
        res.send({
            error:true,
            status:401,
            message: 'Token not found'
        });
        return;
    }
    else{
        // console.log(req.headers.authorization.split('Bearer ')[1])
        const token = req.headers.authorization.split('Bearer ')[1]
        const user = await axios.get(process.env.AUTH_URL+"?token="+token).then(res1=>{
            return res1.data.data;
        }).catch(err=>{
            console.log(err.message)
            return null;
        })
        // const user = detokn(req.headers.authorization.split('Bearer ')[1]);
        if(user){
            req.user = user;
            req.token = token;
            next();
        }
        else{
            console.log("error")
            res.send({
                error:true,
                status:401,
                message: 'Invalid token'
            });
            return;
        }
    }
}

export default require_auth