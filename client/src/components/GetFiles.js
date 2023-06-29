import React,{useState,useEffect} from "react";
import RenderFile from './RenderFile';
import './GetFiles.css'
import { config } from "../config";
import axios from "axios";

function GetFiles(props){
    const [backendData,setBackendData] = useState([]);
    const isFirstRender = React.useRef(true);
    useEffect(() => {
        if(isFirstRender.current){
            getFiles();
            isFirstRender.current = false;
            return;
        }else{
            const latest_file = props.fileObj.name.name;
            setBackendData((preValue)=>
                [...preValue,latest_file]
            )
        }
    }, [props.fileObj.count]);

    function getFiles() {
        console.log(`${config.BASE_URL}/objects/${props.email}`);
        axios.get(`${config.BASE_URL}/objects/${props.email}`)
        .then(response => {
          setBackendData(response.data.objects);
          console.log("done");
        })
        .catch(error => {
          console.log(error);
        });
    }

    return (
        <div className="get-files-container">
            {backendData!== undefined ? <RenderFile currFile={props.fileObj.name.name} info ={backendData} uploadStatus= {props.uploadStatus} email={props.email}/> : null} 
        </div>
    )
}

export default GetFiles;