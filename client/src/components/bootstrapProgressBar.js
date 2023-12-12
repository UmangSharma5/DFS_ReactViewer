import ProgressBar from 'react-bootstrap/ProgressBar';

function BootstrapProgressBar(props) {
  let now = Math.floor(props.percentage);
  return <ProgressBar now={now} label={`${now}%`} />;
}

export default BootstrapProgressBar;
