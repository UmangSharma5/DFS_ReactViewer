import React,{useState,useEffect} from "react";
import RenderFile from './RenderFile';
import './GetFiles.css'
import { config } from "../config";
import axios from "axios";

function GetFiles(props){
    const [backendData,setBackendData] = useState([]);
    const isFirstRender = React.useRef(true);
    const [deletedFileName,setDeletedFileName] = useState();
    const [currFileName,setCurrFileName] = useState();
    useEffect(() => {
        if(isFirstRender.current){
            getFiles();
            isFirstRender.current = false;
            return;
        }else{
            const latest_file = props.fileObj.name.name;
            setCurrFileName(props.fileObj.name.name);
            setBackendData((preValue)=>
                [...preValue,latest_file]
            )
        }
    }, [props.fileObj.count]);

    function getFiles() {
        axios.get(`${config.BASE_URL}/objects/${props.email}`)
        .then(response => {
          setBackendData(response.data.objects);
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
            .post(config.BASE_URL + "/deleteObject/" + props.email, { fileName: delFileName })
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

    return (
        <div className="get-files-container">
            {backendData!== undefined ? <RenderFile currFile={currFileName} info ={backendData} uploadStatus= {props.uploadStatus} email={props.email} onDelete={handleDelete}  deletedFileName={deletedFileName}/> : null} 
        </div>
    )
}

export default GetFiles;