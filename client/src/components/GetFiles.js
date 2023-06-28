import React,{useState,useEffect} from "react";
import RenderFile from './RenderFile';
import './GetFiles.css'

function GetFiles(props){
    const [backendData,setBackendData] = useState([]);
    const isFirstRender = React.useRef(true);
    useEffect(() => {
        console.log(isFirstRender.current);
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
        fetch("/objects/"+props.email)
        .then(response => response.json())
        .then(
          data => {
            setBackendData(data.objects)
          }
        )
        .catch(error => {
            console.log(error);
        });
    }

    return (
        <div className="get-files-container">
            {backendData!== undefined ? <RenderFile currFile={props.fileObj.name.name} info ={backendData} email={props.email}/> : null} 
        </div>
    )
}

export default GetFiles;