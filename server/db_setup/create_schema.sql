use Histdata;

DROP TABLE IF EXISTS User_Bucket;

CREATE TABLE User_Bucket (
    user varchar(255),
    bucket_name varchar(255),
    PRIMARY KEY (user)
);