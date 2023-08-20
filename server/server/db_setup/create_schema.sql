use Histdata;

DROP TABLE IF EXISTS User_Bucket;

CREATE TABLE User_Bucket (
    user varchar(255),
    bucket_name varchar(255),
    PRIMARY KEY (user)
);
DROP TABLE IF EXISTS FileTypeMap;

CREATE TABLE FileTypeMap (
    file_id int NOT NULL AUTO_INCREMENT,
    filename varchar(255),
    file_type varchar(255),
    isUploaded int DEFAULT 0,
    PRIMARY KEY (file_id)
);