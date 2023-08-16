import React,{useState,useEffect} from "react";
import RenderFile from './RenderFile';
import './GetFiles.css'
import { config } from "../config";
import axios from "axios";

function GetFiles(props){
    const [backendData,setBackendData] = useState(null);
    const isFirstRender = React.useRef(true);
    const [deletedFileName,setDeletedFileName] = useState();
    const [currFileName,setCurrFileName] = useState();
    useEffect(() => {

        if(isFirstRender.current){
            getFiles();
            isFirstRender.current = false;
            return;
        }else{
            const latest_file = props.fileObj.name;
            setCurrFileName(props.fileObj.name);
            setBackendData(
                [...backendData,{name:latest_file,format:latest_file?.split('.')[1]}]
            )
        }
    }, [props.fileObj.count]);

    function getFiles() {
        axios.get(`${config.BASE_URL}/objects/${props.email}`,
        {
            headers: {
                'authorization': 'Bearer ' + JSON.parse(localStorage.getItem('dfs-user'))?.['token'],
            }
        })
        .then(response => {
            console.log(response);
          setBackendData(response.data.temp);
        })
        .catch(error => {
          console.log(error);
        });
    }

    function handleDelete(event,file) {
        let delFileName = file;
        setDeletedFileName(file);
        try {
            axios
            .post(config.BASE_URL + "/deleteObject/" + props.email, { fileName: delFileName },
            {
                headers: {
                    'authorization': 'Bearer ' + JSON.parse(localStorage.getItem('dfs-user'))?.['token'],
                }
            })
            .then(response => {
                const updatedData = backendData.filter(currFile => currFile !== delFileName);
                setBackendData(updatedData);
                setCurrFileName(null);
            })
            .catch(error => {
                console.log(error);
            });
        } catch (error) {
            console.log(error);
        }
    }
    console.log("back->",backendData);
    return (
        <div className="get-files-container">
            {backendData ? <RenderFile currFile={currFileName} info ={backendData} uploadStatus= {props.uploadStatus} email={props.email} onDelete={handleDelete}  deletedFileName={deletedFileName} /> : null} 
        </div>
    )
}

export default GetFiles;