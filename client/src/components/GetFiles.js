import React,{useState,useEffect} from "react";
import RenderFile from './RenderFile';
import './GetFiles.css'

function GetFiles(props){
    const [backendData,setBackendData] = useState([{}]);

    useEffect(() => {
        getFiles();
    }, []);

    function getFiles() {
        fetch("/objects/"+props.email)
        .then(response => response.json())
        .then(
          data => {
            setBackendData(data)
          }
        )
        console.log(backendData);
    }

    return (
        <div className="get-files-container">
            {backendData.objects!== undefined ? <RenderFile info ={backendData.objects} email={props.email}/> : null} 
        </div>
    )
}

export default GetFiles;