// Search-as-you-type patient selector, reused by billing, admissions etc.
import { useState } from 'react';
import { Autocomplete, TextField } from '@mui/material';
import api from '../api/client';
import { fullName } from '../utils';

export default function PatientPicker({ value, onChange, label = 'Patient', ...props }) {
  const [options, setOptions] = useState([]);
  const search = (text) =>
    api.get('/patients', { params: { search: text || undefined, pageSize: 10 } }).then((r) => setOptions(r.data.items));

  return (
    <Autocomplete
      options={options}
      value={value}
      onChange={(e, v) => onChange(v)}
      onInputChange={(e, text, reason) => reason === 'input' && search(text)}
      onOpen={() => search('')}
      filterOptions={(x) => x}
      getOptionLabel={(p) => `${fullName(p)} (${p.patientNo})`}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      renderInput={(params) => <TextField {...params} label={label} placeholder="Type a name or patient no" />}
      {...props}
    />
  );
}
