import { useEffect, useState } from 'react'
import api from '../services/api'
import { getApiErrorMessage } from '../utils/apiError'

function Laboratories() {
  const [laboratories, setLaboratories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [editingId, setEditingId] = useState(null)

  useEffect(() => {
    async function fetchLaboratories() {
      try {
        const response = await api.get('/laboratories')
        setLaboratories(response.data)
      } catch (err) {
        setError(
          getApiErrorMessage(err, 'Laboratuvarlar yüklenirken bir hata oluştu.')
        )
      } finally {
        setLoading(false)
      }
    }

    fetchLaboratories()
  }, [])

  function resetForm() {
    setName('')
    setLocation('')
    setEditingId(null)
    setShowForm(false)
    setFormError('')
  }

  function handleEdit(lab) {
    setEditingId(lab.id)
    setName(lab.name)
    setLocation(lab.location || '')
    setFormError('')
    setShowForm(true)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')

    if (!name.trim()) {
      setFormError('Laboratuvar adı zorunludur.')
      return
    }

    setSaving(true)

    try {
      const data = {
        name: name.trim(),
        location: location.trim() || null,
      }

      if (editingId !== null) {
        const response = await api.put(
          `/laboratories/${editingId}`,
          data
        )

        setLaboratories((current) =>
          current.map((lab) =>
            lab.id === editingId ? response.data : lab
          )
        )
      } else {
        const response = await api.post('/laboratories', data)

        setLaboratories((current) => [...current, response.data])
      }

      resetForm()
    } catch (err) {
      setFormError(
        getApiErrorMessage(err, 'İşlem sırasında bir hata oluştu.')
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(lab) {
    const confirmed = window.confirm(
      `"${lab.name}" laboratuvarını silmek istediğinize emin misiniz?`
    )

    if (!confirmed) return

    try {
      await api.delete(`/laboratories/${lab.id}`)

      setLaboratories((current) =>
        current.filter((item) => item.id !== lab.id)
      )
    } catch (err) {
      setError(
        getApiErrorMessage(err, 'Laboratuvar silinirken bir hata oluştu.')
      )
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Laboratuvarlar</h1>
          <p className="page-subtitle">
            Laboratuvar kayıtlarınızı görüntüleyin ve yönetin.
          </p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Laboratuvarlarım</h2>

          <button
            className="add-button"
            onClick={() => {
              if (showForm) {
                resetForm()
              } else {
                setShowForm(true)
                setFormError('')
              }
            }}
          >
            {showForm ? 'İptal' : '+ Laboratuvar Ekle'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="laboratory-form">
            <h3>
              {editingId !== null
                ? 'Laboratuvarı Düzenle'
                : 'Yeni Laboratuvar'}
            </h3>

            <label htmlFor="lab-name">Laboratuvar Adı</label>
            <input
              id="lab-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Örn. Yazılım Laboratuvarı"
              required
            />

            <label htmlFor="lab-location">Konum</label>
            <input
              id="lab-location"
              type="text"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Örn. A Blok, 2. Kat"
            />

            {formError && (
              <p className="auth-error">{formError}</p>
            )}

            <button
              type="submit"
              className="add-button"
              disabled={saving}
            >
              {saving
                ? 'Kaydediliyor...'
                : editingId !== null
                  ? 'Değişiklikleri Kaydet'
                  : 'Kaydet'}
            </button>
          </form>
        )}

        {error && <p className="auth-error">{error}</p>}

        {loading && <p>Laboratuvarlar yükleniyor...</p>}

        {!loading && !error && laboratories.length === 0 && (
          <p>Henüz kayıtlı laboratuvarınız bulunmuyor.</p>
        )}

        {!loading && laboratories.length > 0 && (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>LABORATUVAR ADI</th>
                  <th>KONUM</th>
                  <th>İŞLEMLER</th>
                </tr>
              </thead>

              <tbody>
                {laboratories.map((lab) => (
                  <tr key={lab.id}>
                    <td>{lab.id}</td>
                    <td>{lab.name}</td>
                    <td>{lab.location || 'Belirtilmemiş'}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handleEdit(lab)}
                      >
                        Düzenle
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(lab)}
                      >
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

export default Laboratories
