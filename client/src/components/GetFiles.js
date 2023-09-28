import React,{useState,useEffect} from "react";
import sortFileNames from "../helpers/GetFiles";
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
            // setCurrFileName(props.fileObj.name);
            // setBackendData(
            //     [...backendData,{name:latest_file,format:props.fileObj.format}]
            // )

        }
    }, [props.fileObj.count]);

    async function getFiles() {

        try {
            const response = await axios.get(`${config.BASE_URL}/objects/${props.email}`,{
                headers: {
                  authorization:'Bearer ' +JSON.parse(localStorage.getItem('dfs-user'))?.['token'],
                },
              }
            )
            const sortedData = response.data.temp.sort(sortFileNames)
            setBackendData(sortedData)
            return backendData
          }
        catch (error) {
            console.log(error)
          }

    }

    function handleDelete(event,file) {
        console.log("deleted->",file)
        let delFileName = file.name+"."+file.format;
        setDeletedFileName(delFileName);
        try {
            axios.post(config.BASE_URL + "/deleteObject/" + props.email, { fileName: delFileName },
            {
                headers: {
                    'authorization': 'Bearer ' + JSON.parse(localStorage.getItem('dfs-user'))?.['token'],
                }
            })
            .then(response => {
                // const updatedData = backendData.filter(currFile => currFile !== delFileName);
                const updatedData = Object.values(backendData).filter(
                  (currFile) =>
                    currFile.name !== file.name ||
                    currFile.format !== file.format
                )
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
            {backendData ? <RenderFile getFiles={getFiles} refreshStatus={props.refreshStatus} currFile={currFileName} info ={backendData} uploadStatus= {props.uploadStatus} email={props.email} onDelete={handleDelete}  deletedFileName={deletedFileName} /> : null} 
        </div>
    )
}

export default GetFiles;