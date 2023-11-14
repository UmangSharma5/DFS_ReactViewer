import ProgressBar from 'react-bootstrap/ProgressBar';

function BootstrapProgressBar(props) {
  let val = Math.floor(props.percentage);
  console.log("percen-->",val);
  return <ProgressBar now={val} label={`${val}%`} />;
}

// BootstrapProgressBar.propTypes = {
//   percentage: PropTypes.number.isRequired,
// };

export default BootstrapProgressBar;