import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';

const require_auth_proxylinks = async (req, res, next) => {
  if (!req.query.token) {
    res.send({
      error: true,
      status: 401,
      message: 'Token not found',
    });
    return;
  } else {
    // console.error(req.headers.authorization.split('Bearer ')[1])
    const token = req.query.token;
    const user = await axios
      .get(process.env.AUTH_URL + '?token=' + token)
      .then(res1 => {
        return res1.data.data;
      })
      .catch(err => {
        console.error(err.message);
        return null;
      });
    // const user = detokn(req.headers.authorization.split('Bearer ')[1]);
    if (user) {
      req.user = user;
      req.token = token;
      next();
    } else {
      console.error('error');
      res.send({
        error: true,
        status: 401,
        message: 'Invalid token',
      });
      return;
    }
  }
};

export default require_auth_proxylinks;
