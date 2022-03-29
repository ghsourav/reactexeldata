import {useState} from 'react'
import * as XLSX from 'xlsx'

function App() {

const [sheetFile, setsheetFile] = useState(null);

const exelvalidatin=['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

 const file =(e) =>{
  let files = e.target.files[0];
  if(files){
    let getfiletype =files.type;
    console.log(getfiletype)
    if(files&& exelvalidatin.includes(getfiletype)){
      let reader = new FileReader();
      reader.readAsArrayBuffer(files);
      reader.onload=(e)=>{
        setsheetFile(e.target.result)
        // console.log(e.target.result)
      }
    }
    else{
      setsheetFile(null)
      console.log("Only Excel Allowed")
    }
  }
 }

 const getdata = (e) =>{
  e.preventDefault();
  if(sheetFile!==null){
    const sheet = XLSX.read(sheetFile,{type:'buffer'});
    const sheetname=sheet.SheetNames[0];
   // console.log(sheet)
   // console.log(sheetname)
    const dataSheet = sheet.Sheets[sheetname];
    const xdata = XLSX.utils.sheet_to_json(dataSheet);
    console.log(xdata)
    

    // console.log(aaa)
  }
  else{
    console.log("No exel fil found")
  }
}

  return (
    <div className="App">
        <section id="upload">
          <form onSubmit={getdata}>
          <input type="file" onChange={file}></input>
          <button>Get Data</button>
          </form>
        </section>
    </div>
  );
}

export default App;
