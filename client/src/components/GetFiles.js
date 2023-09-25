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
            const sortedData = response.data.temp.sort((a, b) => {
              const nameA = a.name.toLowerCase()
              const nameB = b.name.toLowerCase()

              if (nameA < nameB) {
                return -1
              }
              if (nameA > nameB) {
                return 1
              }
              return 0
            })
            setBackendData(sortedData)
          }
        catch (error) {
            console.log(error)
          }

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

    return (
        <div className="get-files-container">
            {backendData ? <RenderFile getFiles={getFiles} refreshStatus={props.refreshStatus} currFile={currFileName} info ={backendData} uploadStatus= {props.uploadStatus} email={props.email} onDelete={handleDelete}  deletedFileName={deletedFileName} /> : null} 
        </div>
    )
}

export default GetFiles;